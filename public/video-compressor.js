// Video Compressor — fully client-side using FFmpeg.wasm
// No server dependency. All processing happens in the user's browser.

const $ = (id) => document.getElementById(id);

// Upload elements
const dropZone = $('vc-drop-zone');
const fileInput = $('vc-file-input');
const fileInfo = $('vc-file-info');
const filenameEl = $('vc-filename');
const originalSizeEl = $('vc-original-size');
const changeBtn = $('vc-change-btn');
const wasmLoading = $('vc-wasm-loading');

// Compression controls
const controls = $('vc-controls');
const modeTarget = $('vc-mode-target');
const modePercent = $('vc-mode-percent');
const modeCrf = $('vc-mode-crf');
const panelTarget = $('vc-panel-target');
const panelPercent = $('vc-panel-percent');
const panelCrf = $('vc-panel-crf');
const targetMbInput = $('vc-target-mb');
const reducePctInput = $('vc-reduce-pct');
const pctHint = $('vc-pct-hint');
const crfSlider = $('vc-crf-slider');
const crfVal = $('vc-crf-val');
const crfDesc = $('vc-crf-desc');
const compressBtn = $('vc-compress-btn');

// Progress
const progressContainer = $('vc-progress-container');
const progressFill = $('vc-progress-fill');
const progressText = $('vc-progress-text');

// Status + result
const statusNode = $('vc-status');
const resultSection = $('vc-result');
const resultOriginal = $('vc-result-original');
const resultCompressed = $('vc-result-compressed');
const savingsText = $('vc-savings-text');

let selectedFile = null;
let originalBytes = 0;
let currentMode = 'target'; // 'target' | 'percent' | 'crf'
let videoDuration = 0; // seconds, detected from the video element

function fmt(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function setStatus(msg, isError = false) {
  statusNode.textContent = msg;
  statusNode.style.color = isError ? '#a12612' : '';
}

// ─── Mode Tab Switching ───
function switchMode(mode) {
  currentMode = mode;
  [modeTarget, modePercent, modeCrf].forEach(btn => btn.classList.remove('active'));
  [panelTarget, panelPercent, panelCrf].forEach(p => p.classList.add('hidden'));
  if (mode === 'target') { modeTarget.classList.add('active'); panelTarget.classList.remove('hidden'); }
  if (mode === 'percent') { modePercent.classList.add('active'); panelPercent.classList.remove('hidden'); updatePctHint(); }
  if (mode === 'crf') { modeCrf.classList.add('active'); panelCrf.classList.remove('hidden'); }
}

modeTarget.addEventListener('click', () => switchMode('target'));
modePercent.addEventListener('click', () => switchMode('percent'));
modeCrf.addEventListener('click', () => switchMode('crf'));

// ─── CRF Slider ───
function updateCrfDesc() {
  const v = parseInt(crfSlider.value);
  crfVal.textContent = v;
  if (v <= 22) crfDesc.textContent = '(Near-lossless, larger file)';
  else if (v <= 28) crfDesc.textContent = '(Great quality — recommended)';
  else if (v <= 35) crfDesc.textContent = '(Good quality, much smaller)';
  else if (v <= 42) crfDesc.textContent = '(Decent, very small file)';
  else crfDesc.textContent = '(Low quality, tiny file)';
}
crfSlider.addEventListener('input', updateCrfDesc);

// ─── Percent Hint ───
function updatePctHint() {
  if (originalBytes > 0) {
    const pct = parseInt(reducePctInput.value) || 50;
    const targetBytes = originalBytes * (1 - pct / 100);
    pctHint.textContent = `~${fmt(targetBytes)} target from ${fmt(originalBytes)} original`;
  } else {
    pctHint.textContent = '';
  }
}
reducePctInput.addEventListener('input', updatePctHint);

// ─── Preset Buttons ───
document.querySelectorAll('.vc-preset-mb').forEach(btn => {
  btn.addEventListener('click', () => {
    targetMbInput.value = btn.dataset.mb;
    if (currentMode !== 'target') switchMode('target');
  });
});
document.querySelectorAll('.vc-preset-pct').forEach(btn => {
  btn.addEventListener('click', () => {
    reducePctInput.value = btn.dataset.pct;
    if (currentMode !== 'percent') switchMode('percent');
    updatePctHint();
  });
});

// ─── Get video duration using HTML5 video element ───
function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration || 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
}

// ─── File Upload / Drop ───
async function loadFile(file) {
  if (!file) return;
  const videoTypes = ['video/mp4', 'video/x-matroska', 'video/quicktime', 'video/avi', 'video/webm'];
  const ext = file.name.split('.').pop().toLowerCase();
  const validExts = ['mp4', 'mkv', 'mov', 'avi', 'webm'];
  if (!videoTypes.includes(file.type) && !validExts.includes(ext)) {
    setStatus('Please select a valid video file (MP4, MKV, MOV, AVI, WEBM).', true);
    return;
  }

  selectedFile = file;
  originalBytes = file.size;
  filenameEl.textContent = file.name;
  originalSizeEl.textContent = `Size: ${fmt(file.size)}`;

  // Default target = 50% of original
  const defaultMb = Math.max(1, Math.round(file.size / 1048576 / 2));
  targetMbInput.value = defaultMb;

  // Detect duration
  videoDuration = await getVideoDuration(file);

  dropZone.classList.add('hidden');
  fileInfo.classList.remove('hidden');
  controls.classList.remove('hidden');
  resultSection.classList.add('hidden');
  updatePctHint();
  setStatus('Choose compression settings, then click Compress & Download.');
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

changeBtn.addEventListener('click', () => {
  fileInput.value = '';
  selectedFile = null;
  originalBytes = 0;
  videoDuration = 0;
  fileInfo.classList.add('hidden');
  controls.classList.add('hidden');
  resultSection.classList.add('hidden');
  dropZone.classList.remove('hidden');
  setStatus('Upload a video to begin.');
});

// ─── Compress using FFmpeg.wasm ───
compressBtn.addEventListener('click', async () => {
  if (!selectedFile) {
    setStatus('Please upload a video first.', true); return;
  }

  // Compute target/crf
  let targetMb = null;
  let crf = null;

  if (currentMode === 'target') {
    targetMb = parseFloat(targetMbInput.value);
    if (!targetMb || targetMb < 1) { setStatus('Please enter a valid target size in MB.', true); return; }
    if (targetMb >= selectedFile.size / 1048576) {
      const cappedMb = Math.max(1, Math.round(selectedFile.size / 1048576 * 0.7));
      setStatus(`⚠️ Target (${targetMb} MB) ≥ your file (${fmt(selectedFile.size)}). Auto-setting to ${cappedMb} MB.`);
      targetMb = cappedMb;
      targetMbInput.value = cappedMb;
    }
  } else if (currentMode === 'percent') {
    const pct = parseInt(reducePctInput.value);
    if (!pct || pct < 10 || pct > 90) { setStatus('Please enter a percentage between 10 and 90.', true); return; }
    targetMb = Math.max(1, (selectedFile.size / 1048576) * (1 - pct / 100));
    targetMb = Math.round(targetMb * 100) / 100;
  } else if (currentMode === 'crf') {
    crf = parseInt(crfSlider.value);
  }

  compressBtn.disabled = true;
  changeBtn.disabled = true;
  resultSection.classList.add('hidden');

  // Show loading for ffmpeg.wasm
  wasmLoading.classList.remove('hidden');
  setStatus('Loading video engine…');
  progressContainer.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Loading FFmpeg…';

  try {
    const ffmpeg = await FFmpegLoader.getFFmpeg((ratio) => {
      const pct = Math.min(99, Math.round(ratio * 100));
      progressFill.style.width = pct + '%';
      progressText.textContent = `Loading engine… ${pct}%`;
    });

    // Hide first-load notice once engine is ready
    const notice = document.getElementById('vc-wasm-notice');
    if (notice) notice.classList.add('hidden');
    wasmLoading.classList.add('hidden');
    setStatus('Reading video file…');
    progressFill.style.width = '5%';
    progressText.textContent = 'Reading file…';

    // Write input file to virtual FS
    const inputName = 'input' + (selectedFile.name.match(/\.[^.]+$/) || ['.mp4'])[0].toLowerCase();
    const outputName = 'output.mp4';

    const fileData = new Uint8Array(await selectedFile.arrayBuffer());
    await ffmpeg.writeFile(inputName, fileData);

    setStatus('Compressing video (this may take a while)…');
    progressFill.style.width = '10%';
    progressText.textContent = 'Compressing…';

    // Build FFmpeg args
    const args = ['-i', inputName];

    if (crf) {
      // CRF mode
      args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'fast');
    } else if (targetMb && videoDuration > 0) {
      // Target MB mode — compute bitrate
      const targetBytes = targetMb * 1024 * 1024;
      const targetBitsTotal = targetBytes * 8;
      const audioBitrate = 128000;
      const videoBitrate = Math.max(50000, Math.floor((targetBitsTotal / videoDuration) - audioBitrate));
      const maxRate = Math.floor(videoBitrate * 1.5);
      const bufSize = Math.floor(videoBitrate * 2);

      args.push(
        '-c:v', 'libx264',
        '-b:v', String(videoBitrate),
        '-maxrate', String(maxRate),
        '-bufsize', String(bufSize),
        '-preset', 'fast'
      );
    } else {
      // Fallback CRF 28
      args.push('-c:v', 'libx264', '-crf', '28', '-preset', 'fast');
    }

    args.push(
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputName
    );

    await ffmpeg.exec(args);

    // Read output
    progressFill.style.width = '95%';
    progressText.textContent = 'Preparing download…';
    setStatus('Compression done! Preparing download…');

    const outputData = await ffmpeg.readFile(outputName);
    const blob = new Blob([outputData.buffer], { type: 'video/mp4' });

    // Cleanup virtual FS
    try { await ffmpeg.deleteFile(inputName); } catch {}
    try { await ffmpeg.deleteFile(outputName); } catch {}

    // Download
    const url = URL.createObjectURL(blob);
    const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-compressed.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Show result
    const compressedSize = blob.size;
    resultOriginal.textContent = fmt(originalBytes);
    resultCompressed.textContent = fmt(compressedSize);

    const saved = originalBytes - compressedSize;
    const savedPct = ((saved / originalBytes) * 100).toFixed(1);

    if (saved > 0) {
      savingsText.textContent = `✅ Saved ${fmt(saved)} (${savedPct}% smaller)`;
      savingsText.style.color = '#16a34a';
    } else {
      savingsText.textContent = `⚠️ Output is ${fmt(-saved)} larger — try higher compression.`;
      savingsText.style.color = '#d97706';
    }
    resultSection.classList.remove('hidden');

    progressFill.style.width = '100%';
    progressText.textContent = 'Complete!';
    setStatus(`✅ Done! Compressed to ${fmt(compressedSize)}`);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
  } catch (err) {
    wasmLoading.classList.add('hidden');
    setStatus(err.message || 'Compression failed.', true);
    progressContainer.classList.add('hidden');
  } finally {
    compressBtn.disabled = false;
    changeBtn.disabled = false;
  }
});
