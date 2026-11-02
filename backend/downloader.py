import os
import re
import uuid
import time
import math
import asyncio
import logging
import threading
from typing import Dict, Any, Optional, List
import yt_dlp

from backend.models import FormatOption, MediaInfoResponse, PlaylistItem, TaskStatus

logger = logging.getLogger("snapplay.downloader")
DOWNLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "downloads"))
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Armazenamento em memória das tarefas de download
tasks_lock = threading.Lock()
tasks: Dict[str, Dict[str, Any]] = {}

def format_bytes(size_bytes: Optional[int]) -> str:
    if not size_bytes or size_bytes <= 0:
        return "Tamanho N/A"
    names = ("B", "KB", "MB", "GB", "TB")
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 1)
    return f"{s} {names[i]}"

def format_duration(seconds: Optional[int]) -> str:
    if not seconds or seconds <= 0:
        return "00:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def format_views(count: Optional[int]) -> str:
    if not count:
        return "0 visualizações"
    if count >= 1_000_000_000:
        return f"{count / 1_000_000_000:.1f}B views"
    if count >= 1_000_000:
        return f"{count / 1_000_000:.1f}M views"
    if count >= 1_000:
        return f"{count / 1_000:.1f}K views"
    return f"{count} views"

def get_base_ydl_opts() -> dict:
    return {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'ignoreerrors': True,
        'logtostderr': False,
        'geo_bypass': True,
        'socket_timeout': 30,
        'js_runtimes': {'node': {}},
    }

def is_playlist_url(url: str) -> bool:
    lower = url.lower()
    return ('playlist?list=' in lower or 
            '&list=' in lower or 
            '/playlist/' in lower or 
            'sets/' in lower)

def extract_playlist_sync(url: str) -> MediaInfoResponse:
    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'extract_flat': True,
        'ignoreerrors': True
    })

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        raw_info = ydl.extract_info(url, download=False)
        if not raw_info:
            raise ValueError("Não foi possível carregar a playlist. Verifique se o link está correto e se ela não é privada.")

    raw_entries = raw_info.get('entries', [])
    entries = [e for e in raw_entries if e] # remove vazios

    playlist_id = raw_info.get('id', str(uuid.uuid4())[:8])
    playlist_title = raw_info.get('title') or 'Playlist SnapPlay'
    uploader = raw_info.get('uploader') or raw_info.get('channel') or 'Desconhecido'
    playlist_thumb = raw_info.get('thumbnail')
    if not playlist_thumb and entries:
        playlist_thumb = entries[0].get('thumbnail') or (entries[0].get('thumbnails')[-1]['url'] if entries[0].get('thumbnails') else None)

    items: List[PlaylistItem] = []
    total_duration = 0

    for idx, entry in enumerate(entries):
        v_id = entry.get('id', '')
        v_title = entry.get('title') or f"Vídeo {idx + 1}"
        v_duration = entry.get('duration') or 0
        total_duration += v_duration
        
        # Obter thumbnail
        v_thumb = entry.get('thumbnail')
        if not v_thumb:
            thumbs = entry.get('thumbnails', [])
            if thumbs:
                v_thumb = thumbs[-1].get('url')
            elif v_id:
                v_thumb = f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"
                
        v_url = entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={v_id}"
        if not v_url.startswith('http'):
            v_url = f"https://www.youtube.com/watch?v={v_id}"

        v_uploader = entry.get('uploader') or entry.get('channel') or uploader

        items.append(PlaylistItem(
            id=v_id,
            index=idx + 1,
            title=v_title,
            duration=v_duration,
            duration_formatted=format_duration(v_duration),
            thumbnail=v_thumb,
            url=v_url,
            uploader=v_uploader
        ))

    # Formatos de Áudio da Playlist (Idêntico ao SnapTube: Rápido, MP3 Clássico)
    count = len(items)
    avg_duration = (total_duration / count) if count > 0 else 240
    approx_total_sec = total_duration if total_duration > 0 else (count * 240)

    audio_formats = [
        FormatOption(
            format_id="mp3-128",
            ext="mp3",
            resolution="128 kbps",
            note="Rápido",
            filesize_approx=int((128 * 1024 / 8) * approx_total_sec),
            filesize_formatted=format_bytes(int((128 * 1024 / 8) * approx_total_sec)),
            type="audio",
            quality_label="Rápido",
            vcodec="none",
            acodec="mp3"
        ),
        FormatOption(
            format_id="mp3-320",
            ext="mp3",
            resolution="320 kbps",
            note="MP3 clássico (HQ)",
            filesize_approx=int((320 * 1024 / 8) * approx_total_sec),
            filesize_formatted=format_bytes(int((320 * 1024 / 8) * approx_total_sec)),
            type="audio",
            quality_label="MP3 clássico",
            vcodec="none",
            acodec="mp3"
        ),
        FormatOption(
            format_id="m4a-original",
            ext="m4a",
            resolution="Original",
            note="Áudio Original",
            filesize_approx=int((160 * 1024 / 8) * approx_total_sec),
            filesize_formatted=format_bytes(int((160 * 1024 / 8) * approx_total_sec)),
            type="audio",
            quality_label="M4A Original",
            vcodec="none",
            acodec="aac"
        )
    ]

    # Formatos de Vídeo da Playlist (Idêntico ao SnapTube: Rápido 480p, Alta qualidade 1080p, 720p)
    video_formats = [
        FormatOption(
            format_id="bestvideo[height<=480]+bestaudio/best[height<=480]",
            ext="mp4",
            resolution="854x480",
            note="Rápido (480p)",
            filesize_approx=int((1200 * 1024 / 8) * approx_total_sec),
            filesize_formatted=format_bytes(int((1200 * 1024 / 8) * approx_total_sec)),
            type="video",
            quality_label="Rápido (480p)",
            vcodec="h264",
            acodec="aac"
        ),
        FormatOption(
            format_id="bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            ext="mp4",
            resolution="1920x1080",
            note="Alta qualidade (1080p)",
            filesize_approx=int((4000 * 1024 / 8) * approx_total_sec),
            filesize_formatted=format_bytes(int((4000 * 1024 / 8) * approx_total_sec)),
            type="video",
            quality_label="Alta qualidade (1080p)",
            vcodec="h264",
            acodec="aac"
        ),
        FormatOption(
            format_id="bestvideo[height<=720]+bestaudio/best[height<=720]",
            ext="mp4",
            resolution="1280x720",
            note="HD (720p)",
            filesize_approx=int((2200 * 1024 / 8) * approx_total_sec),
            filesize_formatted=format_bytes(int((2200 * 1024 / 8) * approx_total_sec)),
            type="video",
            quality_label="Qualidade HD (720p)",
            vcodec="h264",
            acodec="aac"
        ),
        FormatOption(
            format_id="bestvideo[height<=360]+bestaudio/best[height<=360]",
            ext="mp4",
            resolution="640x360",
            note="Econômico (360p)",
            filesize_approx=int((700 * 1024 / 8) * approx_total_sec),
            filesize_formatted=format_bytes(int((700 * 1024 / 8) * approx_total_sec)),
            type="video",
            quality_label="Normal (360p)",
            vcodec="h264",
            acodec="aac"
        )
    ]

    return MediaInfoResponse(
        is_playlist=True,
        id=playlist_id,
        title=playlist_title,
        description=f"Playlist com {len(items)} vídeos",
        thumbnail=playlist_thumb,
        duration=total_duration,
        duration_formatted=format_duration(total_duration),
        uploader=uploader,
        uploader_url=None,
        view_count=0,
        view_count_formatted=f"{len(items)} vídeos",
        webpage_url=url,
        platform=raw_info.get('extractor_key', 'YouTube'),
        video_formats=video_formats,
        audio_formats=audio_formats,
        video_count=len(items),
        playlist_items=items
    )

def extract_info_sync(url: str) -> MediaInfoResponse:
    # Se a URL for identificada como Playlist, processa como Playlist
    if is_playlist_url(url):
        try:
            return extract_playlist_sync(url)
        except Exception as e:
            logger.warning(f"Tentativa de playlist falhou ({e}), tentando como mídia única...")

    ydl_opts = get_base_ydl_opts()
    ydl_opts['extract_flat'] = False

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        raw_info = ydl.extract_info(url, download=False)
        if not raw_info:
            raise ValueError("Não foi possível obter dados para esta URL.")

        # Se retornou entradas múltiplas mesmo sem 'playlist' na URL
        if 'entries' in raw_info and len(raw_info.get('entries', [])) > 1:
            return extract_playlist_sync(url)

        if 'entries' in raw_info and raw_info['entries']:
            raw_info = raw_info['entries'][0]

    video_id = raw_info.get('id', str(uuid.uuid4())[:8])
    title = raw_info.get('title', 'Sem Título')
    description = raw_info.get('description', '')
    if description and len(description) > 300:
        description = description[:297] + '...'
    thumbnail = raw_info.get('thumbnail')
    duration = raw_info.get('duration', 0)
    uploader = raw_info.get('uploader') or raw_info.get('channel') or 'Desconhecido'
    uploader_url = raw_info.get('uploader_url') or raw_info.get('channel_url')
    view_count = raw_info.get('view_count', 0)
    webpage_url = raw_info.get('webpage_url') or url
    platform = raw_info.get('extractor_key', 'Desconhecido')

    raw_formats = raw_info.get('formats', [])
    video_formats_map: Dict[str, FormatOption] = {}

    height_priority = [1080, 720, 480, 360, 240]
    labels_map = {
        1080: "1080p Full HD",
        720: "720p HD",
        480: "480p SD",
        360: "360p",
        240: "240p Baixa"
    }

    for fmt in raw_formats:
        vcodec = fmt.get('vcodec')
        if not vcodec or vcodec == 'none':
            continue

        height = fmt.get('height')
        if not height:
            continue

        matched_height = None
        for target_h in height_priority:
            if abs(height - target_h) <= 40:
                matched_height = target_h
                break

        if not matched_height:
            if height >= 1080:
                matched_height = 1080
            elif height >= 720:
                matched_height = 720
            elif height >= 480:
                matched_height = 480
            elif height >= 360:
                matched_height = 360
            else:
                matched_height = 240

        quality_label = labels_map.get(matched_height, f"{matched_height}p")
        filesize = fmt.get('filesize') or fmt.get('filesize_approx')
        if not filesize and duration and duration > 0:
            tbr = fmt.get('tbr') or (matched_height * 2.5)
            filesize = int((tbr * 1024 / 8) * duration)

        ext = fmt.get('ext', 'mp4')

        if matched_height not in video_formats_map or ext == 'mp4':
            video_formats_map[matched_height] = FormatOption(
                format_id=f"bestvideo[height<={matched_height}]+bestaudio/best[height<={matched_height}]",
                ext="mp4",
                resolution=f"{fmt.get('width', '')}x{height}",
                note=fmt.get('format_note') or quality_label,
                filesize_approx=filesize,
                filesize_formatted=format_bytes(filesize),
                type="video",
                quality_label=quality_label,
                vcodec=vcodec,
                acodec=fmt.get('acodec')
            )

    sorted_video_formats = [
        video_formats_map[h]
        for h in height_priority
        if h in video_formats_map
    ]

    if not sorted_video_formats:
        sorted_video_formats.append(
            FormatOption(
                format_id="best",
                ext="mp4",
                resolution="Padrão",
                note="Melhor Qualidade",
                filesize_approx=None,
                filesize_formatted="Automático",
                type="video",
                quality_label="Vídeo MP4 (Melhor)",
                vcodec="auto",
                acodec="auto"
            )
        )

    audio_formats = [
        FormatOption(
            format_id="mp3-320",
            ext="mp3",
            resolution="320 kbps",
            note="Alta Definição (HQ)",
            filesize_approx=int((320 * 1024 / 8) * duration) if duration else None,
            filesize_formatted=format_bytes(int((320 * 1024 / 8) * duration)) if duration else "Áudio HQ",
            type="audio",
            quality_label="MP3 320k (HQ)",
            vcodec="none",
            acodec="mp3"
        ),
        FormatOption(
            format_id="mp3-128",
            ext="mp3",
            resolution="128 kbps",
            note="Qualidade Padrão",
            filesize_approx=int((128 * 1024 / 8) * duration) if duration else None,
            filesize_formatted=format_bytes(int((128 * 1024 / 8) * duration)) if duration else "Áudio Normal",
            type="audio",
            quality_label="MP3 128k (Rápido)",
            vcodec="none",
            acodec="mp3"
        ),
        FormatOption(
            format_id="m4a-original",
            ext="m4a",
            resolution="Original",
            note="Sem perdas / Direto",
            filesize_approx=int((160 * 1024 / 8) * duration) if duration else None,
            filesize_formatted=format_bytes(int((160 * 1024 / 8) * duration)) if duration else "M4A Original",
            type="audio",
            quality_label="M4A Áudio Original",
            vcodec="none",
            acodec="aac"
        )
    ]

    return MediaInfoResponse(
        is_playlist=False,
        id=video_id,
        title=title,
        description=description,
        thumbnail=thumbnail,
        duration=duration,
        duration_formatted=format_duration(duration),
        uploader=uploader,
        uploader_url=uploader_url,
        view_count=view_count,
        view_count_formatted=format_views(view_count),
        webpage_url=webpage_url,
        platform=platform,
        video_formats=sorted_video_formats,
        audio_formats=audio_formats,
        video_count=1,
        playlist_items=[]
    )

async def get_media_info(url: str) -> MediaInfoResponse:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, extract_info_sync, url)

def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name)
    cleaned = cleaned.strip()
    return cleaned[:120] if cleaned else "download"

def download_worker(task_id: str, url: str, format_id: str, media_type: str, quality_label: str, raw_title: Optional[str], raw_thumb: Optional[str]):
    try:
        with tasks_lock:
            tasks[task_id]['status'] = 'downloading'
            tasks[task_id]['progress'] = 5.0

        clean_title = sanitize_filename(raw_title or f"SnapPlay_{task_id[:6]}")
        out_tmpl = os.path.join(DOWNLOADS_DIR, f"{clean_title}_%(id)s.%(ext)s")

        def progress_hook(d):
            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes') or 0
                percent = 0.0
                if total > 0:
                    percent = min(99.0, round((downloaded / total) * 100, 1))
                else:
                    percent_str = d.get('_percent_str', '0%').replace('%', '').strip()
                    try:
                        percent = float(percent_str)
                    except Exception:
                        percent = 50.0

                speed_str = d.get('_speed_str', '')
                eta_str = d.get('_eta_str', '')

                with tasks_lock:
                    if task_id in tasks:
                        tasks[task_id]['progress'] = max(tasks[task_id]['progress'], percent)
                        if speed_str:
                            tasks[task_id]['speed'] = speed_str
                        if eta_str:
                            tasks[task_id]['eta'] = eta_str

            elif d['status'] == 'finished':
                with tasks_lock:
                    if task_id in tasks:
                        tasks[task_id]['status'] = 'processing'
                        tasks[task_id]['progress'] = 98.0

        ydl_opts = get_base_ydl_opts()
        ydl_opts.update({
            'outtmpl': out_tmpl,
            'progress_hooks': [progress_hook],
            'writethumbnail': False,
            'windowsfilenames': True,
        })

        if media_type == 'audio':
            bitrate = '320' if '320' in format_id else '128'
            ext = 'm4a' if 'm4a' in format_id else 'mp3'

            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': ext,
                    'preferredquality': bitrate,
                }],
            })
        else:
            target_format = format_id
            ydl_opts.update({
                'format': target_format,
                'merge_output_format': 'mp4',
                'postprocessors': [{
                    'key': 'FFmpegVideoRemuxer',
                    'preferedformat': 'mp4',
                }],
            })

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            expected_filename = ydl.prepare_filename(info)
            if media_type == 'audio':
                ext = 'm4a' if 'm4a' in format_id else 'mp3'
                base_name, _ = os.path.splitext(expected_filename)
                final_file = f"{base_name}.{ext}"
            else:
                base_name, _ = os.path.splitext(expected_filename)
                final_file = f"{base_name}.mp4"

            actual_file = None
            if os.path.exists(final_file):
                actual_file = final_file
            elif os.path.exists(expected_filename):
                actual_file = expected_filename
            else:
                for fname in os.listdir(DOWNLOADS_DIR):
                    if task_id[:6] in fname or (info.get('id') and info.get('id') in fname):
                        actual_file = os.path.join(DOWNLOADS_DIR, fname)
                        break

            file_size = os.path.getsize(actual_file) if actual_file and os.path.exists(actual_file) else 0
            filename_only = os.path.basename(actual_file) if actual_file else "video.mp4"

            with tasks_lock:
                if task_id in tasks:
                    tasks[task_id]['status'] = 'completed'
                    tasks[task_id]['progress'] = 100.0
                    tasks[task_id]['filename'] = filename_only
                    tasks[task_id]['filesize'] = file_size
                    tasks[task_id]['filesize_formatted'] = format_bytes(file_size)
                    tasks[task_id]['download_url'] = f"/api/download/file/{task_id}"

    except Exception as e:
        logger.error(f"Erro no download da tarefa {task_id}: {e}", exc_info=True)
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]['status'] = 'error'
                tasks[task_id]['error'] = str(e)

def start_download_task(url: str, format_id: str, media_type: str, quality_label: str, title: Optional[str] = None, thumbnail: Optional[str] = None) -> str:
    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {
            'task_id': task_id,
            'url': url,
            'title': title or "Download SnapPlay",
            'thumbnail': thumbnail,
            'media_type': media_type,
            'quality_label': quality_label,
            'status': 'queued',
            'progress': 0.0,
            'speed': 'Iniciando...',
            'eta': 'Calculando...',
            'filename': None,
            'filesize': 0,
            'filesize_formatted': '0 MB',
            'error': None,
            'download_url': None,
            'created_at': time.time(),
        }

    thread = threading.Thread(
        target=download_worker,
        args=(task_id, url, format_id, media_type, quality_label, title, thumbnail),
        daemon=True
    )
    thread.start()
    return task_id

def start_batch_download_tasks(items: List[PlaylistItem], format_id: str, media_type: str, quality_label: str, playlist_title: Optional[str] = None) -> List[str]:
    task_ids = []
    for item in items:
        tid = start_download_task(
            url=item.url,
            format_id=format_id,
            media_type=media_type,
            quality_label=quality_label,
            title=item.title,
            thumbnail=item.thumbnail
        )
        task_ids.append(tid)
    return task_ids

def get_task_status(task_id: str) -> Optional[TaskStatus]:
    with tasks_lock:
        data = tasks.get(task_id)
        if not data:
            return None
        return TaskStatus(**data)

def get_all_tasks() -> List[TaskStatus]:
    with tasks_lock:
        return [TaskStatus(**data) for data in sorted(tasks.values(), key=lambda x: x['created_at'], reverse=True)]

def get_task_file_path(task_id: str) -> Optional[str]:
    with tasks_lock:
        data = tasks.get(task_id)
        if not data or data.get('status') != 'completed':
            return None
        filename = data.get('filename')
        if not filename:
            return None
        path = os.path.join(DOWNLOADS_DIR, filename)
        if os.path.exists(path):
            return path
        return None
