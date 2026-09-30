FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DB_PATH=/data/app.db

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Unprivileged user; it owns only the data directory.
RUN useradd --system --uid 10001 --no-create-home fingen \
    && mkdir -p /data && chown fingen /data
COPY --chown=root:root app ./app

USER fingen
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"

# Only nginx reaches this container, so its X-Forwarded-For (the real client IP, used for rate limits) is trusted.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
