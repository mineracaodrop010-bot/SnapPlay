import asyncio
import logging
from typing import List
import yt_dlp

from backend.models import SearchResultItem
from backend.downloader import format_duration, format_views, get_base_ydl_opts

logger = logging.getLogger("snapplay.search")

def search_sync(query: str, limit: int = 16) -> List[SearchResultItem]:
    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'extract_flat': 'in_playlist',
        'default_search': 'ytsearch',
        'playlistend': limit,
    })

    search_query = f"ytsearch{limit}:{query}" if not query.startswith(('http://', 'https://')) else query

    results: List[SearchResultItem] = []
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            raw_data = ydl.extract_info(search_query, download=False)
            if not raw_data:
                return []

            entries = raw_data.get('entries', []) if 'entries' in raw_data else [raw_data]

            for entry in entries:
                if not entry:
                    continue

                item_id = entry.get('id', '')
                title = entry.get('title', 'Sem Título')
                url = entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={item_id}"
                if not url.startswith('http'):
                    url = f"https://www.youtube.com/watch?v={item_id}"

                thumbnails = entry.get('thumbnails', [])
                thumb_url = None
                if thumbnails:
                    thumb_url = thumbnails[-1].get('url')
                elif entry.get('thumbnail'):
                    thumb_url = entry.get('thumbnail')
                else:
                    thumb_url = f"https://i.ytimg.com/vi/{item_id}/hqdefault.jpg" if item_id else None

                duration = entry.get('duration', 0)
                uploader = entry.get('uploader') or entry.get('channel') or "Canal Desconhecido"
                views = entry.get('view_count')

                results.append(SearchResultItem(
                    id=item_id,
                    title=title,
                    url=url,
                    thumbnail=thumb_url,
                    duration=duration,
                    duration_formatted=format_duration(duration),
                    uploader=uploader,
                    views=format_views(views),
                    platform="youtube"
                ))
        except Exception as e:
            logger.error(f"Erro ao buscar '{query}': {e}", exc_info=True)

    return results

async def search_media(query: str, limit: int = 16) -> List[SearchResultItem]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, search_sync, query, limit)
