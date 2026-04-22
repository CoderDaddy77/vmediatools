// Video Downloader — Hybrid
// YouTube → copy URL + open y2mate.ws  |  Everything else → yt-dlp (Render backend)

const RENDER_API = window.RENDER_API_URL || 'https://vmediatools.onrender.com';
const YT_REDIRECT = 'https://y2mate.ws';

const urlInput      = document.getElementById('dl-url');
const fetchBtn      = document.getElementById('dl-fetch-btn');
const optionsEl     = document.getElementById('dl-options');
const typeSelect    = document.getElementById('dl-type');
const qualitySelect = document.getElementById('dl-quality');
const qualityGroup  = document.getElementById('dl-quality-group');
const progressCont  = document.getElementById('dl-progress-container');
const progressFill  = document.getElementById('dl-progress-fill');
const progressText  = document.getElementById('dl-progress-text');
const statusEl      = document.getElementById('dl-status');
const infoCard      = document.getElementById('dl-info-card');
const thumbEl       = document.getElementById('dl-thumb');
const titleEl       = document.getElementById('dl-title');
const uploaderEl    = document.getElementById('dl-uploader');
const durationEl    = document.getElementById('dl-duration');
const downloadBtn   = document.getElementById('dl-download-btn');
const ytRedirectBox = document.getElementById('dl-yt-redirect');
const ytRedirectBtn = document.getElementById('dl-yt-btn');
const ytCopyBtn     = document.getElementById('dl-yt-copy');

let currentVideoInfo = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#a12612' : '';
}
function showProgress(pct, label) {
  progressCont.classList.remove('hidden');
  if (progressFill) progressFill.style.width = pct ? `${pct}%` : '';
  if (progressText) progressText.textContent = label;
}
function hideProgress() { progressCont.classList.add('hidden'); }

function formatDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^(www\.|m\.)/, '');
    return ['youtube.com', 'youtu.be', 'music.youtube.com'].includes(host);
  } catch { return false; }
}

typeSelect.addEventListener('change', () => {
  qualityGroup.style.display = typeSelect.value === 'audio' ? 'none' : '';
});

fetchBtn.addEventListener('click', fetchInfo);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchInfo(); });

// ── Copy button on YT redirect row ──
if (ytCopyBtn) {
  ytCopyBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      ytCopyBtn.textContent = 'Copied!';
      setTimeout(() => { ytCopyBtn.textContent = 'Copy link'; }, 2000);
    } catch {
      ytCopyBtn.textContent = 'Copy failed';
    }
  });
}

async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url) { setStatus('Please paste a video URL first.', true); return; }
  try { new URL(url); } catch { setStatus("That doesn't look like a valid URL.", true); return; }

  fetchBtn.disabled = true;
  infoCard.classList.add('hidden');
  optionsEl.style.display = 'none';
  if (ytRedirectBox) ytRedirectBox.classList.add('hidden');
  setStatus('');

  // ── YouTube → copy + open y2mate.ws ──
  if (isYouTubeUrl(url)) {
    hideProgress();

    // Auto-copy URL to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setStatus('✅ Link copied — paste it on y2mate.ws');
    } catch {
      setStatus('Open y2mate.ws and paste your link');
    }

    // Show minimal redirect row
    if (ytRedirectBox) {
      ytRedirectBox.classList.remove('hidden');
      if (ytRedirectBtn) ytRedirectBtn.href = YT_REDIRECT;
      if (ytCopyBtn) ytCopyBtn.textContent = 'Copy link';
    }

    fetchBtn.disabled = false;
    return;
  }

  // ── Everything else → yt-dlp backend ──
  showProgress(null, 'Fetching video info…');
  try {
    const resp = await fetch(`${RENDER_API}/api/info?url=${encodeURIComponent(url)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to fetch video info.');

    currentVideoInfo = data;
    thumbEl.src = data.thumbnail || '';
    thumbEl.style.display = data.thumbnail ? '' : 'none';
    titleEl.textContent = data.title;
    uploaderEl.textContent = data.uploader ? `by ${data.uploader}` : '';
    durationEl.textContent = data.duration ? `⏱ ${formatDuration(data.duration)}` : '';

    infoCard.classList.remove('hidden');
    optionsEl.style.display = 'flex';
    hideProgress();
    setStatus('Ready — choose format and click Download.');
  } catch (err) {
    hideProgress();
    setStatus(err.message || 'Could not fetch video info.', true);
  } finally {
    fetchBtn.disabled = false;
  }
}

// ── Download with progress feedback ──
downloadBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url || !currentVideoInfo) return;

  const type    = typeSelect.value;
  const quality = qualitySelect.value;
  const label   = type === 'audio' ? 'MP3' : quality === 'best' ? 'Best MP4' : `${quality}p MP4`;

  downloadBtn.disabled = true;
  downloadBtn.textContent = '⏳ Starting…';

  // Trigger download
  const downloadUrl = `${RENDER_API}/api/download?` + new URLSearchParams({ url, type, quality });
  const ext = type === 'audio' ? 'mp3' : 'mp4';
  const qualityLabel = type === 'audio' ? 'audio' : (quality === 'best' ? 'best' : `${quality}p`);

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `video_vmediatools(${qualityLabel}).${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Show status, hide any progress, re-enable button
  setStatus(`⬇️ Downloading ${label}… check your Downloads folder.`);
  hideProgress();
  downloadBtn.disabled = false;
  downloadBtn.textContent = '⬇️ Download';
});
