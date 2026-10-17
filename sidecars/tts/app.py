#!/usr/bin/env python3
"""
DevX Control — Jarvis TTS sidecar. One internal interface, swappable engines.

  GET  /healthz                 -> {"ok":true,"engines":{...}}
  GET  /voices                  -> {"voices":[{engine,id,label,lang,gender}]}
  POST /speak                   -> audio/wav
       body = {"text","engine","voice","lang","speed"}  (json)
         engine: "kokoro" (default, Apache-2.0) | "piper" (MIT, Arabic/low-latency)
         voice : engine voice id (see /voices)
         lang  : "en" | "ar" (hint; piper picks an Arabic voice, kokoro en only)
         speed : 0.7..1.3 (default 1.0)

Engines are loaded lazily and independently: if one engine's model is missing the
other still serves. Models live in /models (mounted volume). Licences recorded in
docs/JARVIS.md. No network port is published; called over the internal jarvis net.
"""
import io
import json
import os
import struct
import subprocess
import tarfile
import time
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("TTS_PORT", "8078"))
MODEL_DIR = os.environ.get("MODEL_DIR", "/models")
MAX_CHARS = 2000

# ---- model sources (overridable via env) ------------------------------------
KOKORO_ONNX_URL = os.environ.get(
    "KOKORO_ONNX_URL",
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
)
KOKORO_VOICES_URL = os.environ.get(
    "KOKORO_VOICES_URL",
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
)
# Piper prebuilt binary (MIT) — provisioned at runtime to sidestep the piper-phonemize wheel gap.
PIPER_BIN_URL = os.environ.get(
    "PIPER_BIN_URL",
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz",
)
# Piper voices (rhasspy/piper-voices on HF). model + json per voice.
PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
PIPER_VOICES = {
    "en_GB-alba-medium": "en/en_GB/alba/medium/en_GB-alba-medium",
    "en_GB-northern_english_male-medium": "en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium",
    "ar_JO-kareem-medium": "ar/ar_JO/kareem/medium/ar_JO-kareem-medium",
}

# British-leaning assistant voices first (Kokoro v1 voice ids).
KOKORO_VOICES = [
    {"id": "bf_emma", "label": "Emma (British, warm)", "lang": "en", "gender": "f"},
    {"id": "bm_george", "label": "George (British, calm)", "lang": "en", "gender": "m"},
    {"id": "bm_lewis", "label": "Lewis (British, dry)", "lang": "en", "gender": "m"},
    {"id": "bf_isabella", "label": "Isabella (British)", "lang": "en", "gender": "f"},
    {"id": "af_heart", "label": "Heart (US, neutral)", "lang": "en", "gender": "f"},
]

_kokoro = None
_kokoro_err = None
_piper_dir = None      # dir holding the piper binary + libs + espeak data
_piper_ready = set()   # voice ids whose .onnx model is on disk


def _fetch(url: str, dest: str):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    urllib.request.urlretrieve(url, tmp)  # noqa: S310 - pinned known hosts
    os.replace(tmp, dest)
    return dest


def get_kokoro():
    global _kokoro, _kokoro_err
    if _kokoro is not None or _kokoro_err is not None:
        return _kokoro
    try:
        from kokoro_onnx import Kokoro
        m = _fetch(KOKORO_ONNX_URL, os.path.join(MODEL_DIR, "kokoro", "kokoro.onnx"))
        v = _fetch(KOKORO_VOICES_URL, os.path.join(MODEL_DIR, "kokoro", "voices.bin"))
        _kokoro = Kokoro(m, v)
    except Exception as e:  # noqa: BLE001
        _kokoro_err = str(e)
    return _kokoro


def ensure_piper_bin():
    """Download + extract the prebuilt piper binary once into /models/piper-bin."""
    global _piper_dir
    if _piper_dir:
        return _piper_dir
    root = os.path.join(MODEL_DIR, "piper-bin")
    exe = os.path.join(root, "piper", "piper")
    if not os.path.exists(exe):
        os.makedirs(root, exist_ok=True)
        tgz = os.path.join(root, "piper.tgz")
        urllib.request.urlretrieve(PIPER_BIN_URL, tgz)  # noqa: S310
        with tarfile.open(tgz) as t:
            t.extractall(root)  # noqa: S202 - trusted pinned release
        os.unlink(tgz)
        os.chmod(exe, 0o755)
    _piper_dir = os.path.join(root, "piper")
    return _piper_dir


def ensure_piper_voice(voice: str):
    rel = PIPER_VOICES.get(voice)
    if not rel:
        raise ValueError("unknown piper voice")
    base = os.path.join(MODEL_DIR, "piper", voice)
    model = _fetch(f"{PIPER_BASE}/{rel}.onnx", base + ".onnx")
    _fetch(f"{PIPER_BASE}/{rel}.onnx.json", base + ".onnx.json")
    _piper_ready.add(voice)
    return model, base + ".onnx.json"


def piper_synth(text: str, voice: str) -> bytes:
    pdir = ensure_piper_bin()
    model, cfg = ensure_piper_voice(voice)
    out = os.path.join("/tmp", f"piper_{os.getpid()}_{int(time.time()*1000)}.wav")
    env = dict(os.environ, LD_LIBRARY_PATH=pdir)
    try:
        subprocess.run(
            [os.path.join(pdir, "piper"), "--model", model, "--config", cfg,
             "--espeak_data", os.path.join(pdir, "espeak-ng-data"),
             "--output_file", out],
            input=text.encode("utf-8"), env=env, capture_output=True, timeout=120, check=True,
        )
        with open(out, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass


def _wav_bytes(pcm_f32, rate: int) -> bytes:
    """float32 [-1,1] samples -> 16-bit PCM wav bytes (vectorised)."""
    import numpy as np
    arr = np.clip(np.asarray(pcm_f32, dtype=np.float32), -1.0, 1.0)
    frames = (arr * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(frames)
    return buf.getvalue()


def speak(text, engine, voice, lang, speed):
    if engine == "piper" or (lang == "ar"):
        v = voice if voice in PIPER_VOICES else ("ar_JO-kareem-medium" if lang == "ar" else "en_GB-alba-medium")
        return piper_synth(text, v), "piper", v
    k = get_kokoro()
    if k is None:
        raise RuntimeError("kokoro not available: " + str(_kokoro_err))
    vid = voice if any(x["id"] == voice for x in KOKORO_VOICES) else "bf_emma"
    samples, rate = k.create(text, voice=vid, speed=float(speed), lang="en-gb")
    return _wav_bytes(samples, int(rate)), "kokoro", vid


# Voice-FX post-processing chains (ffmpeg). "jarvis" = presence EQ + calm compression
# + subtle spatial depth + loudness normalisation, for a produced, seamless assistant tone.
FX_CHAINS = {
    "jarvis": (
        "highpass=f=80,"
        "equalizer=f=250:t=q:w=1.2:g=-2,"
        "equalizer=f=3400:t=q:w=1.3:g=3,"
        "treble=g=2:f=8500,"
        "acompressor=threshold=-18dB:ratio=3:attack=8:release=150:makeup=3,"
        "aecho=0.8:0.88:22:0.14,"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    ),
    "clean": (
        "highpass=f=80,"
        "equalizer=f=3200:t=q:w=1.4:g=2,"
        "acompressor=threshold=-18dB:ratio=2.5:attack=10:release=160:makeup=2,"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    ),
}


def postfx(wav: bytes, preset: str) -> bytes:
    """Run a wav through an ffmpeg filter chain; return processed wav bytes."""
    chain = FX_CHAINS.get(preset)
    if not chain:
        return wav
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
         "-i", "pipe:0", "-af", chain,
         "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav", "pipe:1"],
        input=wav, capture_output=True, timeout=60,
    )
    if proc.returncode != 0 or not proc.stdout:
        return wav  # never fail the request over FX; fall back to dry audio
    return proc.stdout


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_a):
        pass

    def do_GET(self):
        if self.path == "/healthz":
            return self._json(200, {"ok": True, "engines": {
                "kokoro": {"loaded": _kokoro is not None, "error": _kokoro_err},
                "piper": {"bin": _piper_dir is not None, "voices": sorted(_piper_ready)}}})
        if self.path == "/voices":
            vs = [{"engine": "kokoro", **v} for v in KOKORO_VOICES]
            vs += [{"engine": "piper", "id": k, "label": k, "lang": "ar" if k.startswith("ar") else "en",
                    "gender": "m" if "male" in k or "kareem" in k else "f"} for k in PIPER_VOICES]
            return self._json(200, {"voices": vs})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/speak":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("content-length", "0") or "0")
        try:
            req = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "bad json"})
        text = str(req.get("text", "")).strip()[:MAX_CHARS]
        if not text:
            return self._json(400, {"error": "empty text"})
        engine = req.get("engine", "kokoro")
        voice = req.get("voice") or os.environ.get("JARVIS_VOICE", "bm_george")
        lang = req.get("lang", "en")
        speed = req.get("speed", 1.0)
        # default FX from env (owner's locked choice); request can override or disable with fx="none".
        fx = req.get("fx", os.environ.get("JARVIS_FX", ""))
        fx = "" if fx in (None, "none") else str(fx)
        try:
            t0 = time.time()
            audio, used_engine, used_voice = speak(text, engine, voice, lang, speed)
            if fx:
                audio = postfx(audio, fx)
            self.send_response(200)
            self.send_header("content-type", "audio/wav")
            self.send_header("content-length", str(len(audio)))
            self.send_header("x-engine", used_engine)
            self.send_header("x-voice", used_voice)
            self.send_header("x-fx", fx)
            self.send_header("x-ms", str(int((time.time() - t0) * 1000)))
            self.end_headers()
            self.wfile.write(audio)
        except Exception as e:  # noqa: BLE001
            self._json(500, {"error": str(e)[:300]})


if __name__ == "__main__":
    print(f"jarvis-tts on :{PORT} (kokoro default, piper fallback)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
