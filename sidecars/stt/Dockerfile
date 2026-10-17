# Jarvis STT sidecar — faster-whisper on CPU (int8). Internal network only.
FROM python:3.12-slim

# ffmpeg for mp4/webm/ogg -> wav transcode (iPhone Safari records audio/mp4).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Pinned deps. faster-whisper pulls ctranslate2 + tokenizers (CPU wheels).
RUN pip install --no-cache-dir \
    "faster-whisper==1.0.3" \
    "requests==2.32.3"

# Non-root, read-only-friendly: models live in a mounted volume at /models.
RUN useradd -u 10077 -m jarvis && mkdir -p /models && chown jarvis /models
WORKDIR /app
COPY app.py /app/app.py
USER jarvis

ENV STT_MODEL=small STT_COMPUTE=int8 STT_PORT=8077 MODEL_DIR=/models
EXPOSE 8077
HEALTHCHECK --interval=20s --timeout=5s --start-period=120s --retries=5 \
    CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8077/healthz',timeout=3).status==200 else 1)"
CMD ["python", "-u", "app.py"]
