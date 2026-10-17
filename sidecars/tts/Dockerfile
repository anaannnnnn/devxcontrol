# Jarvis TTS sidecar — Kokoro-82M (Apache-2.0) default + Piper (MIT) fallback. CPU, internal net only.
FROM python:3.12-slim

# espeak-ng: phonemiser used by kokoro-onnx (and available to piper). Minimal otherwise.
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng \
    && rm -rf /var/lib/apt/lists/*

# Pinned. onnxruntime (CPU) comes in via kokoro-onnx. Piper runs from its prebuilt
# MIT binary (provisioned at runtime into /models) to avoid the piper-phonemize wheel gap.
RUN pip install --no-cache-dir \
    "kokoro-onnx==0.4.9" \
    "soundfile==0.12.1"

RUN useradd -u 10078 -m jarvis && mkdir -p /models && chown jarvis /models
WORKDIR /app
COPY app.py /app/app.py
USER jarvis

ENV TTS_PORT=8078 MODEL_DIR=/models
EXPOSE 8078
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8078/healthz',timeout=3).status==200 else 1)"
CMD ["python", "-u", "app.py"]
