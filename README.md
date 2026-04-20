# Vera Media Tools

Free, client-side media toolkit. All processing happens **in your browser** — your files never leave your device.

## Tools
- **Video to MP3** — Extract MP3 audio from any video file (uses FFmpeg.wasm)
- **WAV → MP3** — Convert WAV audio to MP3 at custom bitrate (uses lamejs)
- **Image Compressor** — Compress PNG/JPEG/WebP to a target KB size (uses Canvas API)
- **Video Compressor** — Reduce video file size with Target MB / % / CRF control (uses FFmpeg.wasm)

## Tech Stack
| Layer | Technology |
|---|---|
| Audio encoding | [lamejs](https://github.com/nicktindall/lamejs) — browser MP3 encoder |
| Video processing | [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) 0.12.x |
| Image compression | HTML5 Canvas API + binary search |
| Hosting | Firebase Hosting (static) / any static host |
| Dev server | Node.js (static file server only — zero server-side processing) |

## Run Locally
```bash
node server.js
# Open http://localhost:3000
```

## Deploy to Firebase
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose "public" as public directory, SPA = No
firebase deploy
```

## Architecture
This is a **fully static website**. `server.js` is only a convenience dev server — it serves static files from `/public`. In production, any static host works (Firebase, Netlify, GitHub Pages, Vercel, Cloudflare Pages).

No backend, no database, no API keys, no server costs.
