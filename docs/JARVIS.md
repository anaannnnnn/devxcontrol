# Jarvis — voice AI operator for DevX Control

Status: **Phase 1 complete — voice chosen. Phase 2 (tool registry + confirmation) starting.**

**Voice decision (locked):** English = **Kokoro `bm_george` + `jarvis` FX** ("enhanced George").
It is the TTS sidecar default (`JARVIS_VOICE=bm_george`, `JARVIS_FX=jarvis`); callers can
override per request or pass `fx:"none"` for dry audio. Arabic = Piper `ar_JO-kareem`.
**Latency tuning (my default, reversible):** STT drops to `base.en` and sidecars get more CPU
to approach a snappy feel; owner can revert to `small` for max accuracy. To be confirmed in Phase 7.
Branch: `feature/jarvis`. Nothing deployed to production. The live DevX Control,
Caddy, DNS and other apps are untouched.

## What Jarvis is
A voice-first operator for the DevX Control fleet: a separate page (planned
`jarvis.<domain>`, host-matched so the dashboard is untouched) with a living orb and
one talk control. It answers questions about the fleet, summarises and (with
confirmation) approves/rejects reviews, turns spoken requests into Autopilot/Studio
tasks that still go through review, operates apps (restart/backup/redeploy) behind
confirmation + re-auth, and briefs proactively. Safety model: a fixed tool registry
with risk tiers T0–T3 and a server-issued confirmation the model cannot bypass.

## Architecture (target)
```
iPhone/desktop page --(audio POST)--> Control /jarvis/api
                                         |- STT sidecar (faster-whisper) -> text
                                         |- Brain: lib/llm.js tool-calling over a fixed tool registry
                                         |- TTS sidecar (Kokoro / Piper) -> audio
page <--(SSE: transcript, tool status, cards, audio chunks)-- Control
```
Control server keeps its **zero-npm-dependency** rule. STT/TTS are **Docker sidecars**
on an internal network, no published ports, memory-capped, health-checked, called over HTTP.

## Sidecars (built, Phase 1)
Both are Python stdlib HTTP servers (no web framework), non-root, models in a mounted volume.

### STT — `sidecars/stt` (image `jarvis-stt:dev`)
- **faster-whisper 1.0.3**, model `small`, `int8`, CPU. English + Arabic, auto-detect.
- Accepts mp4/webm/ogg/wav (iPhone Safari records `audio/mp4`); transcodes with **ffmpeg** to 16 kHz mono.
- `POST /transcribe?lang=&prompt=` → `{text,language,ms,model}`; `GET /healthz`.
- Biasing `prompt` seeds fleet app names to improve recognition.

### TTS — `sidecars/tts` (image `jarvis-tts:dev`)
- One interface `POST /speak {text,engine,voice,lang,speed}` → `audio/wav`; `GET /voices`, `GET /healthz`.
- **Kokoro-82M** via `kokoro-onnx 0.4.9` — the quality default; British voices (bf_emma, bm_george, bm_lewis, bf_isabella…).
- **Piper** via its prebuilt MIT binary (provisioned at runtime; the `piper-tts` pip wheel has no py3.12 `piper-phonemize`) — fast + Arabic (en_GB-alba, en_GB-northern_english_male, ar_JO-kareem).

## Licences (free / open-source only)
| Component | Licence | Notes |
|---|---|---|
| faster-whisper | MIT | CTranslate2 backend (MIT) |
| Whisper models | MIT | OpenAI model weights |
| Kokoro-82M | Apache-2.0 | kokoro-onnx runtime Apache-2.0 |
| Piper (code + binary) | MIT | per-voice licences vary; voices used here are permissive — verify before client-facing use |
| espeak-ng | GPL-3.0 | used as a phonemiser (separate process/sidecar, not linked into the zero-dep Control server) |

## Measured on this server (shared CPU; sidecars capped STT 1.5 cpu / TTS 2 cpu)
- **STT** (whisper small int8): transcript **accurate** on clean TTS speech; warm latency ≈ **7.2 s for a 5.5 s clip** (RTF ≈ 1.3). Cold (first call, model load) ≈ 9.8 s. RSS ≈ 0.93 GB.
- **TTS Kokoro**: short sentence (~2.4 s audio) ≈ **3.9 s**; full (~5.5 s audio) ≈ **8.0 s**; RTF ≈ 1.5. RSS ≈ 0.70 GB.
- **TTS Piper**: short ≈ **1.1 s**; full ≈ **2.1 s**; RTF ≈ 0.3. Arabic works.

### Honest latency verdict
The brief's target (speech-end → first audio under ~2.5 s) is **not met on this server**
with `small` Whisper + Kokoro: STT alone is ~7 s on a multi-second clip. Levers, in order:
1. **More CPU** for the sidecars (RTF scales with cores; caps are conservative).
2. **Smaller STT** (`base.en`/`tiny.en`) — 2–3× faster, slightly less accurate; measure Arabic separately.
3. **Piper as the default voice** (meets latency comfortably), Kokoro reserved for briefings / pre-cached phrases.
4. **Phrase caching** for fixed lines (confirmations, briefing openers).
Decision deferred to the owner together with the voice choice.

## Open decision (Phase 1 checkpoint)
Owner to pick the English voice from the blind-test page (Kokoro = premium/slower,
Piper = fast; Arabic = Piper Kareem), and the STT/CPU tradeoff above. Then Phase 2
(tool registry + confirmation flow) begins.

## Not yet built
Tool registry & risk tiers, confirmation flow, brain/tool-calling in `lib/llm.js`,
knowledge (BM25) index, the page/orb, actions, briefings, settings, hardening, tests,
overlay compose file + Caddy snippet. Build order per the brief's §9.
