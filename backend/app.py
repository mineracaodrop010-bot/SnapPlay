import os
import io
import socket
import base64
import logging
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import qrcode

from backend.models import (
    InfoRequest,
    SearchRequest,
    DownloadRequest,
    BatchDownloadRequest,
    MediaInfoResponse,
    SearchResultItem,
    TaskStatus
)
from backend.downloader import (
    get_media_info,
    start_download_task,
    start_batch_download_tasks,
    get_task_status,
    get_all_tasks,
    get_task_file_path,
    DOWNLOADS_DIR
)
from backend.search import search_media

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("snapplay")

app = FastAPI(
    title="SnapPlay API",
    description="Backend oficial do SnapPlay - Player & Downloader de Mídias e Playlists Multiplataforma",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

def get_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "SnapPlay", "version": "1.1.0"}

@app.get("/api/network-info")
async def get_network_info(request: Request):
    lan_ip = get_lan_ip()
    port = request.url.port or 8000
    host_header = request.headers.get("host", f"{lan_ip}:{port}")
    scheme = request.url.scheme or "http"
    
    current_url = f"{scheme}://{host_header}"
    mobile_url = f"http://{lan_ip}:{port}"
    
    qr = qrcode.QRCode(
        version=1,
        box_size=8,
        border=2,
    )
    qr.add_data(mobile_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#FFBE00", back_color="#0F172A")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    
    return {
        "local_ip": lan_ip,
        "port": port,
        "mobile_url": mobile_url,
        "current_url": current_url,
        "qr_code_base64": f"data:image/png;base64,{qr_b64}"
    }

@app.post("/api/info", response_model=MediaInfoResponse)
async def fetch_media_info(req: InfoRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="A URL não pode estar vazia.")
    try:
        info = await get_media_info(req.url.strip())
        return info
    except Exception as e:
        logger.error(f"Erro ao obter informações da URL {req.url}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar o link: {str(e)}")

@app.post("/api/search", response_model=List[SearchResultItem])
async def search_endpoint(req: SearchRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="O termo de busca não pode estar vazio.")
    try:
        results = await search_media(req.query.strip(), limit=req.limit)
        return results
    except Exception as e:
        logger.error(f"Erro ao pesquisar {req.query}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na pesquisa: {str(e)}")

@app.post("/api/download/start")
async def start_download(req: DownloadRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="URL inválida.")
    task_id = start_download_task(
        url=req.url,
        format_id=req.format_id,
        media_type=req.media_type,
        quality_label=req.quality_label,
        title=req.title,
        thumbnail=req.thumbnail
    )
    return {"status": "started", "task_id": task_id}

@app.post("/api/playlist/download")
async def start_playlist_download(req: BatchDownloadRequest):
    if not req.items or len(req.items) == 0:
        raise HTTPException(status_code=400, detail="Nenhum vídeo selecionado para download.")
    
    task_ids = start_batch_download_tasks(
        items=req.items,
        format_id=req.format_id,
        media_type=req.media_type,
        quality_label=req.quality_label,
        playlist_title=req.playlist_title
    )
    return {
        "status": "started",
        "task_ids": task_ids,
        "count": len(task_ids)
    }

@app.get("/api/download/status/{task_id}", response_model=TaskStatus)
async def check_download_status(task_id: str):
    task = get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    return task

@app.get("/api/downloads", response_model=List[TaskStatus])
async def list_downloads():
    return get_all_tasks()

@app.get("/api/download/file/{task_id}")
async def download_file_endpoint(task_id: str):
    file_path = get_task_file_path(task_id)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo pronto não encontrado ou ainda em processamento.")
    
    filename = os.path.basename(file_path)
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream"
    )

if os.path.exists(DOWNLOADS_DIR):
    app.mount("/media", StaticFiles(directory=DOWNLOADS_DIR), name="media")

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    lan_ip = get_lan_ip()
    print("=" * 60)
    print("🚀 SnapPlay - Servidor Iniciado!")
    print(f"💻 Acesso no Notebook: http://localhost:8000")
    print(f"📱 Acesso no Celular (mesmo Wi-Fi): http://{lan_ip}:8000")
    print("=" * 60)
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
