from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class InfoRequest(BaseModel):
    url: str = Field(..., description="URL do vídeo, áudio ou playlist para extrair informações")

class SearchRequest(BaseModel):
    query: str = Field(..., description="Termo de pesquisa")
    limit: int = Field(default=16, ge=1, le=50)

class FormatOption(BaseModel):
    format_id: str
    ext: str
    resolution: Optional[str] = None
    note: Optional[str] = None
    filesize_approx: Optional[int] = None
    filesize_formatted: Optional[str] = None
    type: str # 'video' or 'audio'
    quality_label: str # ex: "1080p Full HD", "MP3 320k", etc.
    vcodec: Optional[str] = None
    acodec: Optional[str] = None

class PlaylistItem(BaseModel):
    id: str
    index: int
    title: str
    duration: Optional[int] = 0
    duration_formatted: Optional[str] = "00:00"
    thumbnail: Optional[str] = None
    url: str
    uploader: Optional[str] = "Desconhecido"

class MediaInfoResponse(BaseModel):
    is_playlist: bool = False
    id: str
    title: str
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[int] = 0
    duration_formatted: Optional[str] = "00:00"
    uploader: Optional[str] = "Desconhecido"
    uploader_url: Optional[str] = None
    view_count: Optional[int] = 0
    view_count_formatted: Optional[str] = "0"
    webpage_url: str
    platform: str
    video_formats: List[FormatOption] = []
    audio_formats: List[FormatOption] = []
    # Campos de Playlist (quando is_playlist = True)
    video_count: Optional[int] = 0
    playlist_items: List[PlaylistItem] = []

class DownloadRequest(BaseModel):
    url: str
    format_id: str
    media_type: str = "video" # 'video' or 'audio'
    quality_label: str = "720p"
    title: Optional[str] = None
    thumbnail: Optional[str] = None

class BatchDownloadRequest(BaseModel):
    items: List[PlaylistItem]
    format_id: str
    media_type: str = "video"
    quality_label: str = "1080p"
    playlist_title: Optional[str] = "Playlist"

class SearchResultItem(BaseModel):
    id: str
    title: str
    url: str
    thumbnail: Optional[str] = None
    duration: Optional[int] = 0
    duration_formatted: Optional[str] = "00:00"
    uploader: Optional[str] = "Desconhecido"
    views: Optional[str] = None
    platform: str = "youtube"

class TaskStatus(BaseModel):
    task_id: str
    url: str
    title: str
    thumbnail: Optional[str] = None
    media_type: str
    quality_label: str
    status: str # queued, downloading, processing, completed, error
    progress: float = 0.0 # 0 to 100
    speed: Optional[str] = None
    eta: Optional[str] = None
    filename: Optional[str] = None
    filesize: Optional[int] = None
    filesize_formatted: Optional[str] = None
    error: Optional[str] = None
    download_url: Optional[str] = None
