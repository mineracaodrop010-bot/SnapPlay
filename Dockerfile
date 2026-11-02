FROM python:3.12-slim

# Instala dependências do sistema: ffmpeg, curl, unzip, certificados e nodejs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    unzip \
    ca-certificates \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Instala Deno (recomendado oficialmente pelo yt-dlp para solucionar desafios JS)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

WORKDIR /app

# Copia e instala dependências do Python com extras do yt-dlp
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir -U "yt-dlp[default]"

# Copia código do backend e frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Cria pasta de downloads
RUN mkdir -p downloads

ENV PORT=8000
EXPOSE 8000

# Inicia o servidor SnapPlay usando a porta configurada pelo Render ($PORT)
CMD ["sh", "-c", "python -m uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
