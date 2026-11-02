FROM python:3.12-slim

# Instala dependências do sistema: ffmpeg e nodejs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    npm \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia e instala dependências do Python
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copia código do backend e frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Cria pasta de downloads
RUN mkdir -p downloads

ENV PORT=8000
EXPOSE 8000

# Inicia o servidor SnapPlay
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
