// Background Remover — uses @imgly/background-removal (WASM + ONNX AI in browser)
// No server, no API key — AI model downloads once and is cached by browser
// Speed optimizations: eager library preload + model pre-warm + fast/quality mode toggle

const dropZone      = document.getElementById('bgr-drop');
const fileInput     = document.getElementById('bgr-input');
const fileInfo      = document.getElementById('bgr-file-info');
const filenameEl    = document.getElementById('bgr-filename');
const filesizeEl    = document.getElementById('bgr-filesize');
const changeBtn     = document.getElementById('bgr-change-btn');
const controlsEl    = document.getElementById('bgr-controls');
const removeBtn     = document.getElementById('bgr-btn');
const statusNode    = document.getElementById('bgr-status');
const progressContainer = document.getElementById('bgr-progress-container');
const progressFill  = document.getElementById('bgr-progress-fill');
const progressText  = document.getElementById('bgr-progress-text');
const resultEl      = document.getElementById('bgr-result');
const originalImg   = document.getElementById('bgr-original-img');
const outputImg     = document.getElementById('bgr-output-img');
const downloadBtn   = document.getElementById('bgr-download');
const downloadWhiteBtn = document.getElementById('bgr-download-white');
const noticeEl      = document.getElementById('bgr-notice');
const qualityToggle = document.getElementById('bgr-quality-toggle');

let selectedFile = null;
let outputBlob   = null;    // the transparent PNG blob
// Persist modelLoaded in localStorage so it survives page refreshes.
// Once the model is downloaded once, we never show the first-use notice or
// "Downloading" label again — the browser cache handles it silently.
let modelLoaded  = localStorage.getItem('bgr-model-cached') === 'true';
let libPreloading = false;  // library is being preloaded

function setStatus(msg, isError = false) {
  statusNode.textContent = msg;
  statusNode.style.color = isError ? '#a12612' : '';
}

function setProgress(pct, label) {
  progressContainer.classList.remove('hidden');
  progressFill.style.width = pct + '%';
  progressText.textContent = label || pct + '%';
}

function resetProgress() {
  progressContainer.classList.add('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus('Please select a valid image file (PNG, JPEG, WebP).', true);
    return;
  }
  selectedFile = file;
  outputBlob   = null;

  filenameEl.textContent = file.name;
  filesizeEl.textContent = `Size: ${fmtSize(file.size)}`;

  // Use createObjectURL — instant, synchronous, works on all mobile browsers
  // (FileReader is async and can silently fail on mobile with module scripts)
  if (originalImg.src && originalImg.src.startsWith('blob:')) URL.revokeObjectURL(originalImg.src);
  originalImg.src = URL.createObjectURL(file);

  dropZone.classList.add('hidden');
  fileInfo.classList.remove('hidden');
  controlsEl.classList.remove('hidden');
  resultEl.classList.add('hidden');

  // Show notice only if model has never been downloaded (localStorage flag absent)
  if (!modelLoaded) noticeEl.classList.remove('hidden');
  else noticeEl.classList.add('hidden');

  setStatus('Click "Remove Background" to process this image.');
  resetProgress();
}

// ── Drop zone events ──
// iOS Safari fix: expose loadFile globally so the inline onchange in HTML can reach it.
// Module-scope change listeners don't reliably fire on iOS Safari for file inputs.
window.__bgrLoadFile = loadFile;

// Desktop fallback — also listen via JS (module scope works fine on desktop)
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

// ── Upload Another ──
changeBtn.addEventListener('click', () => {
  fileInput.value = '';
  selectedFile = null;
  outputBlob   = null;
  fileInfo.classList.add('hidden');
  controlsEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  dropZone.classList.remove('hidden');
  noticeEl.classList.add('hidden');
  resetProgress();
  setStatus('Select an image to begin.');
});

// ── AI library loading ──
// esm.sh resolves the correct ESM entry + handles CORS reliably
const IMGLY_CDN = 'https://esm.sh/@imgly/background-removal@1.4.5';

// Returns the removeBackground function, loading the module if needed.
// Shows progress UI only if showProgress=true (i.e. user triggered it).
async function ensureBGRemovalLib(showProgress = false) {
  if (window.__bgRemoval) return window.__bgRemoval;

  if (showProgress) setProgress(5, 'Loading AI library…');

  try {
    const mod = await import(IMGLY_CDN);
    if (!mod || !mod.removeBackground) {
      throw new Error('removeBackground not found in loaded module.');
    }
    window.__bgRemoval = mod.removeBackground;
    return window.__bgRemoval;
  } catch (err) {
    throw new Error('Could not load AI library: ' + (err.message || err));
  }
}

// ── Eager preload: start loading the library immediately on page load ──
// This eliminates the ~1-3s library-load delay when the user clicks Remove.
(async () => {
  libPreloading = true;
  try {
    await ensureBGRemovalLib(false); // silent — no progress UI
  } catch (_) {
    // silently ignore — will retry when user clicks
  } finally {
    libPreloading = false;
    if (modelLoaded && noticeEl) noticeEl.classList.add('hidden');
  }
})();

// ── Pre-scale image to a max dimension before AI processing ──
// The AI processing time is proportional to pixel count.
// Scaling 3000px → 800px makes it ~14x fewer pixels = dramatically faster.
// Fast mode: max 800px  |  Quality mode: max 1400px
async function resizeImageForAI(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      // Skip resize if already within limit
      if (w <= maxDim && h <= maxDim) { resolve(file); return; }
      const scale  = maxDim / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Resize failed')), file.type || 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // fallback: use original
    img.src = url;
  });
}

// ── Main: Remove Background ──
removeBtn.addEventListener('click', async () => {
  if (!selectedFile) { setStatus('Please select an image first.', true); return; }

  removeBtn.disabled = true;
  changeBtn.disabled = true;
  resultEl.classList.add('hidden');
  outputBlob = null;
  noticeEl.classList.add('hidden');

  // Detect chosen quality mode
  // Fast = resize to 800px max (much fewer pixels = much faster AI)
  // Quality = resize to 1400px max (better detail, slower)
  const useFastMode = qualityToggle && qualityToggle.value === 'fast';
  const maxDim = useFastMode ? 800 : 1400;

  try {
    // Step 1: ensure library is loaded (likely already done by preload)
    const isLibReady = !!window.__bgRemoval;
    if (!isLibReady) setProgress(5, 'Loading AI library…');
    const removeBackground = await ensureBGRemovalLib(!isLibReady);

    // Step 2: pre-scale the image — this is the #1 speed factor
    setStatus(`Preparing image… (${useFastMode ? 'Fast' : 'Quality'} mode)`);
    setProgress(10, 'Resizing image…');
    const processBlob = await resizeImageForAI(selectedFile, maxDim);

    // Step 3: run background removal on the scaled image
    setStatus(`AI is processing… (${useFastMode ? 'Fast mode — 800px' : 'Quality mode — 1400px'})`);
    setProgress(15, 'Initialising AI model…');

    const config = {
      progress: (key, current, total) => {
        if (total > 0) {
          const pct = Math.round((current / total) * 70) + 15;
          let label;
          if (key === 'compute:inference') {
            label = 'Running AI inference…';
          } else if (modelLoaded) {
            label = 'Loading model from cache…';
          } else {
            label = 'Downloading AI model (one-time)…';
          }
          setProgress(Math.min(85, pct), label);
        }
      },
    };

    const resultBlob = await removeBackground(processBlob, config);
    // Mark model as cached — persists across page reloads via localStorage
    modelLoaded = true;
    localStorage.setItem('bgr-model-cached', 'true');

    setProgress(90, 'Preparing result…');
    outputBlob = resultBlob;

    const outputUrl = URL.createObjectURL(resultBlob);
    if (outputImg.src && outputImg.src.startsWith('blob:')) URL.revokeObjectURL(outputImg.src);
    outputImg.src = outputUrl;

    setProgress(100, '✅ Done!');
    setStatus('✅ Background removed! Download below.');
    resultEl.classList.remove('hidden');
    setTimeout(resetProgress, 3000);

  } catch (err) {
    const msg = err.message || 'Background removal failed.';
    setStatus('❌ ' + msg.slice(0, 160), true);
    resetProgress();
  } finally {
    removeBtn.disabled = false;
    changeBtn.disabled = false;
  }
});

// ── Download transparent PNG ──
downloadBtn.addEventListener('click', () => {
  if (!outputBlob) return;
  const baseName = (selectedFile?.name || 'image').replace(/\.[^.]+$/, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(outputBlob);
  a.download = `${baseName}-no-bg.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  setStatus('✅ Transparent PNG downloaded!');
});

// ── Download on white background ──
downloadWhiteBtn.addEventListener('click', async () => {
  if (!outputBlob) return;

  try {
    // Composite the transparent PNG onto a white canvas
    const img = new Image();
    img.src = URL.createObjectURL(outputBlob);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);

    canvas.toBlob(blob => {
      if (!blob) return;
      const baseName = (selectedFile?.name || 'image').replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}-white-bg.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatus('✅ White background version downloaded!');
    }, 'image/jpeg', 0.95);
  } catch {
    setStatus('Download failed.', true);
  }
});
