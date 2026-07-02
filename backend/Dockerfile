FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Usuário non-root (hardening de contêiner). Executa antes do CMD para que
# o uvicorn não rode como root.
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Liveness via Python (a imagem slim não tem curl/wget). Respeita $PORT.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request,sys; p=os.getenv('PORT','8000'); sys.exit(0 if urllib.request.urlopen(f'http://localhost:{p}/api/healthz', timeout=4).status==200 else 1)"

# Em produção (Render) a porta é injetada via $PORT; localmente cai em 8000.
# O docker-compose de desenvolvimento sobrescreve este CMD com --reload,
# então este comando vale apenas para produção.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]
