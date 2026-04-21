// ═══════════════════════════════════════════════════════════
// Vera Media Tools — Backend Server (Render)
// ═══════════════════════════════════════════════════════════
// Handles server-side conversions using LibreOffice:
//   POST /api/ppt-to-pdf   — PPTX → PDF
//   POST /api/word-to-pdf  — DOCX → PDF
//   GET  /api/status       — Health check (for UptimeRobot)
//
// Firebase hosts the frontend (HTML/CSS/JS).
// This server only handles API requests.
// ═══════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Allowed origins ───
const ALLOWED_ORIGINS = [
  'https://vmediatools.web.app',
  'https://vmediatools.firebaseapp.com',
  'https://vera-media-tools.web.app',
  'https://vera-media-tools.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed — ' + origin));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// ─── Multer — in-memory upload (max 50MB) ───
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const extAllowed = ['.pptx', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || extAllowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .pptx and .docx files are allowed.'));
    }
  },
});

// ─── Helpers ───

function getTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vera-'));
}

function cleanUp(...files) {
  files.forEach(f => {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  });
}

function cleanUpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function libreOfficeCmd(inputPath, outputDir) {
  return `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;
}

// Check LibreOffice is available
function checkLibreOffice() {
  return new Promise((resolve) => {
    exec('libreoffice --version', (err) => resolve(!err));
  });
}

// ─── Auto-update yt-dlp on startup ───
// yt-dlp updates very frequently (YouTube changes often) — always run latest
function updateYtDlp() {
  console.log('[yt-dlp] Checking for updates…');
  exec('pip3 install --break-system-packages --upgrade yt-dlp', (err, stdout) => {
    if (err) { console.warn('[yt-dlp] Update failed:', err.message); return; }
    const line = stdout.split('\n').filter(l => l.includes('yt-dlp')).pop() || 'done';
    console.log('[yt-dlp] Update result:', line.trim());
  });
}

// ─── Routes ───

// Health check
app.get('/api/status', (req, res) => {
  exec('yt-dlp --version', (err, stdout) => {
    res.json({
      status: 'ok',
      service: 'vera-media-tools-backend',
      uptime: process.uptime(),
      ytdlp: stdout.trim() || 'unknown',
    });
  });
});

// ─── Video Info (get title, thumbnail, formats) ───
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter.' });

  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }

  const safeUrl = url.replace(/"/g, '');

  // YouTube bot bypass: use iOS player client which doesn't require auth
  const ytFlags = `--extractor-args "youtube:player_client=ios,mweb" --no-check-certificates`;
  const cmd = `yt-dlp --dump-json --no-playlist --no-warnings ${ytFlags} "${safeUrl}"`;

  exec(cmd, { timeout: 45000 }, (err, stdout, stderr) => {
    if (err) {
      const raw = stderr || err.message || 'Could not fetch video info.';
      // Friendlier error message
      let msg = raw.split('\n')[0];
      if (msg.includes('Sign in') || msg.includes('bot')) {
        msg = 'YouTube is blocking this request. Try a different video or platform.';
      } else if (msg.includes('not available')) {
        msg = 'This video is not available (private, geo-restricted or deleted).';
      }
      return res.status(400).json({ error: msg });
    }
    try {
      const info = JSON.parse(stdout);
      res.json({
        title:     info.title || 'Unknown',
        uploader:  info.uploader || info.channel || '',
        thumbnail: info.thumbnail || '',
        duration:  info.duration || 0,
        formats: (info.formats || [])
          .filter(f => f.ext && (f.vcodec !== 'none' || f.acodec !== 'none'))
          .map(f => ({
            format_id: f.format_id,
            ext:       f.ext,
            quality:   f.format_note || (f.height ? `${f.height}p` : f.format_id),
            filesize:  f.filesize || f.filesize_approx || null,
            hasVideo:  f.vcodec !== 'none',
            hasAudio:  f.acodec !== 'none',
          }))
          .slice(-30),
      });
    } catch {
      res.status(500).json({ error: 'Failed to parse video info.' });
    }
  });
});

// ─── Video Download (stream via yt-dlp) ───
app.get('/api/download', (req, res) => {
  const { url, format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', type = 'video' } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter.' });

  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }

  const safeUrl = url.replace(/"/g, '');
  const safeFormat = format.replace(/[^a-zA-Z0-9\[\]+./\-_]/g, '');

  // YouTube bot bypass flags
  const ytFlags = `--extractor-args "youtube:player_client=ios,mweb" --no-check-certificates`;
  // Build yt-dlp command — with YouTube bot bypass
  // -o - : output to stdout so we can stream it
  const cmd = type === 'audio'
    ? `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 -o - --no-playlist --no-warnings ${ytFlags} "${safeUrl}"`
    : `yt-dlp -f "${safeFormat}" -o - --no-playlist --no-warnings --merge-output-format mp4 ${ytFlags} "${safeUrl}"`;

  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const mime = type === 'audio' ? 'audio/mpeg' : 'video/mp4';

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="download.${ext}"`);
  res.setHeader('Transfer-Encoding', 'chunked');

  const child = exec(cmd, { maxBuffer: 1024 * 1024 * 500 }); // 500MB buffer

  child.stdout.pipe(res);

  child.stderr.on('data', (data) => {
    // Log progress to server console only (not sent to client)
    process.stdout.write('[yt-dlp] ' + data);
  });

  child.on('error', (err) => {
    console.error('[download] spawn error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  child.on('close', (code) => {
    if (code !== 0) console.warn('[download] yt-dlp exited with code', code);
    res.end();
  });

  // If client disconnects, kill yt-dlp
  req.on('close', () => { try { child.kill('SIGTERM'); } catch {} });
});

// PPT to PDF
app.post('/api/ppt-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.pptx') return res.status(400).json({ error: 'Only .pptx files are supported.' });

  const tmpDir = getTmpDir();
  const inputPath = path.join(tmpDir, `input${ext}`);
  const expectedOutput = path.join(tmpDir, 'input.pdf');

  try {
    // Write uploaded file to tmp
    fs.writeFileSync(inputPath, req.file.buffer);

    // Check LibreOffice
    const hasLibre = await checkLibreOffice();
    if (!hasLibre) {
      cleanUpDir(tmpDir);
      return res.status(503).json({ error: 'LibreOffice not available on this server.' });
    }

    // Run LibreOffice conversion
    await new Promise((resolve, reject) => {
      exec(libreOfficeCmd(inputPath, tmpDir), { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
    });

    if (!fs.existsSync(expectedOutput)) {
      throw new Error('Conversion produced no output file.');
    }

    const pdfBuffer = fs.readFileSync(expectedOutput);
    const outputName = req.file.originalname.replace(/\.pptx$/i, '.pdf');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${outputName}"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[ppt-to-pdf]', err.message);
    res.status(500).json({ error: err.message || 'Conversion failed.' });
  } finally {
    cleanUpDir(tmpDir);
  }
});

// Word to PDF
app.post('/api/word-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.docx') return res.status(400).json({ error: 'Only .docx files are supported.' });

  const tmpDir = getTmpDir();
  const inputPath = path.join(tmpDir, `input${ext}`);
  const expectedOutput = path.join(tmpDir, 'input.pdf');

  try {
    fs.writeFileSync(inputPath, req.file.buffer);

    const hasLibre = await checkLibreOffice();
    if (!hasLibre) {
      cleanUpDir(tmpDir);
      return res.status(503).json({ error: 'LibreOffice not available on this server.' });
    }

    await new Promise((resolve, reject) => {
      exec(libreOfficeCmd(inputPath, tmpDir), { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
    });

    if (!fs.existsSync(expectedOutput)) {
      throw new Error('Conversion produced no output file.');
    }

    const pdfBuffer = fs.readFileSync(expectedOutput);
    const outputName = req.file.originalname.replace(/\.docx$/i, '.pdf');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${outputName}"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[word-to-pdf]', err.message);
    res.status(500).json({ error: err.message || 'Conversion failed.' });
  } finally {
    cleanUpDir(tmpDir);
  }
});

// ─── Local dev: also serve static files ───
if (process.env.NODE_ENV !== 'production') {
  const PUBLIC_DIR = path.join(__dirname, 'public');
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css',
    '.js': 'application/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.zip': 'application/zip',
  };
  const ROUTES = {
    '/': '/index.html', '/convert': '/convert.html', '/about': '/about.html',
    '/mp3': '/mp3.html', '/compressor': '/compressor.html',
    '/compressor/video': '/video-compressor.html',
    '/downloader': '/downloader.html',
    '/image-converter': '/image-converter.html',
    '/images-to-pdf': '/images-to-pdf.html',
    '/word-to-pdf': '/word-to-pdf.html',
    '/ppt-to-pdf': '/ppt-to-pdf.html',
  };
  app.use((req, res) => {
    let reqPath = req.url.split('?')[0];
    reqPath = ROUTES[reqPath] || reqPath;
    const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
    if (!filePath.startsWith(PUBLIC_DIR)) return res.status(403).end();
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(filePath));
  });
}

app.listen(PORT, () => {
  console.log(`\n✅ Vera Media Tools backend running on http://localhost:${PORT}`);
  console.log(`   API: /api/ppt-to-pdf  /api/word-to-pdf  /api/download  /api/status\n`);

  // Auto-update yt-dlp with latest YouTube fixes on every startup
  updateYtDlp();

  // ─── Self-ping to prevent Render free tier from sleeping ───
  // Render sets RENDER_EXTERNAL_HOSTNAME automatically (e.g. vera-media-tools-backend.onrender.com)
  const selfHost = process.env.RENDER_EXTERNAL_HOSTNAME;
  if (selfHost) {
    const https = require('https');
    const PING_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

    function selfPing() {
      const url = `https://${selfHost}/api/status`;
      https.get(url, (res) => {
        console.log(`[self-ping] ✅ ${url} → ${res.statusCode}`);
      }).on('error', (err) => {
        console.warn(`[self-ping] ⚠️  ${err.message}`);
      });
    }

    // First ping after 1 minute, then every 10 minutes
    setTimeout(() => {
      selfPing();
      setInterval(selfPing, PING_INTERVAL_MS);
    }, 60 * 1000);

    console.log(`   🔁 Self-ping active → https://${selfHost}/api/status every 10 min\n`);
  } else {
    console.log(`   ℹ️  No RENDER_EXTERNAL_HOSTNAME set — self-ping disabled (local dev)\n`);
  }
});
