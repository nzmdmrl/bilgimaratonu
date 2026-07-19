FROM python:3.11-slim

WORKDIR /app

# Sistem bağımlılıkları (psycopg2, cryptography vs. için)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Önce requirements'ı kopyala (Docker cache için)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Uygulama kodunu kopyala
COPY . .

EXPOSE 8000

# Göçleri uygula, sonra backend'i başlat
CMD uvicorn app.main:app --host 0.0.0.0 --port 8000
