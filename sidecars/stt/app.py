#!/usr/bin/env python3
"""
DevX Control — Jarvis STT sidecar (faster-whisper).

Zero web-framework: Python stdlib http.server only. Accepts audio in mp4/webm/wav/ogg
(iPhone Safari records audio/mp4), transcodes to 16 kHz mono wav with ffmpeg, then
transcribes with faster-whisper (int8, CPU). English + Arabic with auto-detect.

Endpoints:
  GET  /healthz                      -> {"ok": true, "model": "...", "loaded": bool}
  POST /transcribe?lang=&prompt=     -> {"text","language","ms","model"}
       body = raw audio bytes; query:
         lang   = "" (auto) | "en" | "ar"
         prompt = short biasing prompt (e.g. fleet app names) [optional]

Config via env:
  STT_MODEL   default "small"   (tiny|base|small|medium ...)
  STT_PORT    default 8077
  STT_COMPUTE default "int8"
  MODEL_DIR   default "/models"
No network is published; called only over the internal jarvis network.
"""
import json
import os
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

MODEL_NAME = os.environ.get("STT_MODEL", "small")
PORT = int(os.environ.get("STT_PORT", "8077"))
COMPUTE = os.environ.get("STT_COMPUTE", "int8")
MODEL_DIR = os.environ.get("MODEL_DIR", "/models")
MAX_BYTES = 25 * 1024 * 1024  # 25 MB cap on an upload

_model = None
_load_err = None


def get_model():
    """Lazy-load so /healthz answers before the model is ready."""
    global _model, _load_err
    if _model is not None or _load_err is not None:
        return _model
    try:
        from faster_whisper import WhisperModel
        _model = WhisperModel(
            MODEL_NAME, device="cpu", compute_type=COMPUTE, download_root=MODEL_DIR
        )
    except Exception as e:  # noqa: BLE001 - surface any load failure as text
        _load_err = str(e)
    return _model


def transcode_to_wav(raw: bytes) -> str:
    """ffmpeg: any container -> 16 kHz mono 16-bit wav. Returns temp path."""
    src = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
    src.write(raw)
    src.close()
    out = src.name + ".wav"
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
         "-i", src.name, "-ac", "1", "-ar", "16000", "-f", "wav", out],
        capture_output=True, timeout=60,
    )
    try:
        os.unlink(src.name)
    except OSError:
        pass
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg failed: " + proc.stderr.decode("utf-8", "replace")[:300])
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code: int, obj: dict):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):  # quiet; the Control server logs calls
        pass

    def do_GET(self):
        if urlparse(self.path).path == "/healthz":
            m = get_model()
            return self._send(200, {"ok": True, "model": MODEL_NAME,
                                    "loaded": m is not None, "error": _load_err})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/transcribe":
            return self._send(404, {"error": "not found"})
        length = int(self.headers.get("content-length", "0") or "0")
        if length <= 0 or length > MAX_BYTES:
            return self._send(400, {"error": "missing or oversized audio body"})
        raw = self.rfile.read(length)
        q = parse_qs(parsed.query)
        lang = (q.get("lang", [""])[0] or "").strip() or None
        prompt = (q.get("prompt", [""])[0] or "").strip()[:400] or None

        m = get_model()
        if m is None:
            return self._send(503, {"error": "model not loaded: " + str(_load_err)})
        wav = None
        try:
            t0 = time.time()
            wav = transcode_to_wav(raw)
            segments, info = m.transcribe(
                wav, language=lang, vad_filter=True,
                initial_prompt=prompt, beam_size=1, condition_on_previous_text=False,
            )
            text = "".join(s.text for s in segments).strip()
            return self._send(200, {
                "text": text,
                "language": getattr(info, "language", lang or ""),
                "ms": int((time.time() - t0) * 1000),
                "model": MODEL_NAME,
            })
        except subprocess.TimeoutExpired:
            return self._send(400, {"error": "audio too long / ffmpeg timeout"})
        except Exception as e:  # noqa: BLE001
            return self._send(500, {"error": str(e)[:300]})
        finally:
            if wav:
                try:
                    os.unlink(wav)
                except OSError:
                    pass


if __name__ == "__main__":
    print(f"jarvis-stt: faster-whisper '{MODEL_NAME}' ({COMPUTE}) on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
