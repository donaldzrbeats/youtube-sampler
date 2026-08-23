# AGENTS.md - CloudSampler Specification

## System Architecture
A browser-based music sampler with YouTube audio extraction.

### Core Stack
- **Backend:** Python 3.10+, FastAPI, Uvicorn, yt-dlp, FFmpeg
- **Frontend:** Vite, Vanilla JavaScript (ES6 Modules), Wavesurfer.js v7, Web Audio API
- **Testing:** Pytest (Backend), Vitest (Frontend)

## Audio Engineering Rules
1. **AudioContext Lifecycle:** Resume suspended `AudioContext` on user interaction (click/keypress) before triggering audio.
2. **Non-Destructive Slices:** Never mutate the decoded `AudioBuffer`. Store slices as timestamp objects: `{ id: string, start: number, end: number, color: string }`.
3. **Playback Triggers:** Use `AudioBufferSourceNode` connected to dynamic gain nodes. Stop prior sources on trigger if monophonic/choke mode is enabled.
4. **WAV Export Specification:** Audio export must render via `OfflineAudioContext` directly to 16-bit linear PCM WAV at the buffer's native sample rate.

## Validation Commands
Before submitting a PR, verify all checks pass:
- **Backend:** `pytest backend/`
- **Frontend:** `npm run test`
- **Build:** `npm run build`