// Video to MP3 — fully client-side using FFmpeg.wasm
// No server dependency. All processing happens in the user's browser.

const dropZone = document.getElementById('mp3-drop-zone');
const fileInput = document.getElementById('mp3-file-input');
const uploadInfo = document.getElementById('mp3-upload-info');
const uploadFilename = document.getElementById('mp3-upload-filename');
const uploadFilesize = document.getElementById('mp3-upload-filesize');
const changeBtn = document.getElementById('mp3-upload-change-btn');
const uploadBitrate = document.getElementById('mp3-upload-bitrate');
const uploadConvertBtn = document.getElementById('mp3-upload-convert-button');
const statusNode = document.getElementById('mp3-status');
const progressContainer = document.getElementById('mp3-progress-container');
const progressFill = document.getElementById('mp3-progress-fill');
const progressText = document.getElementById('mp3-progress-text');

let selectedFile = null;

function setStatus(msg, isError = false) {
  statusNode.textContent = msg;
  statusNode.style.color = isError ? '#a12612' : '';
}

function resetProgress() {
  progressContainer.classList.add('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function loadFile(file) {
  if (!file) return;

  const maxSize = 500 * 1024 * 1024;
  if (file.size > maxSize) {
    setStatus('File too large. Maximum 500 MB.', true);
    return;
  }

  // Validate it's a video
  const validExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.3gp', '.m4v', '.ts', '.mts'];
  const ext = file.name.toLowerCase().match(/\.[^.]+$/);
  if (!ext || (!file.type.startsWith('video/') && !validExts.includes(ext[0]))) {
    setStatus('Please select a valid video file.', true);
    return;
  }

  selectedFile = file;
  uploadFilename.textContent = file.name;
  uploadFilesize.textContent = fmtSize(file.size);

  dropZone.classList.add('hidden');
  uploadInfo.classList.remove('hidden');

  uploadConvertBtn.disabled = false;
  setStatus('Ready to convert. Pick a bitrate and click Convert to MP3.');
}

// Drop zone click → open file picker

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

// Upload Another button
changeBtn.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  uploadFilename.textContent = '';
  uploadFilesize.textContent = '';

  uploadInfo.classList.add('hidden');
  dropZone.classList.remove('hidden');

  uploadConvertBtn.disabled = true;
  resetProgress();
  setStatus('Select a video file to begin.');
});

// Convert button — FFmpeg.wasm client-side
uploadConvertBtn.addEventListener('click', async () => {
  if (!selectedFile) { setStatus('Please select a file first.', true); return; }

  uploadConvertBtn.disabled = true;
  changeBtn.disabled = true;
  setStatus('Loading audio engine…');

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
    const notice = document.getElementById('mp3-wasm-notice');
    if (notice) notice.classList.add('hidden');

    setStatus('Reading video file…');
    progressFill.style.width = '5%';
    progressText.textContent = 'Reading file…';

    // Write input to virtual FS
    const inputExt = (selectedFile.name.match(/\.[^.]+$/) || ['.mp4'])[0].toLowerCase();
    const inputName = 'input' + inputExt;
    const outputName = 'output.mp3';

    const fileData = new Uint8Array(await selectedFile.arrayBuffer());
    await ffmpeg.writeFile(inputName, fileData);

    const bitrate = uploadBitrate.value || '320';
    setStatus(`Extracting MP3 at ${bitrate} kbps (processing in your browser)…`);
    progressFill.style.width = '10%';
    progressText.textContent = 'Converting…';

    // Run FFmpeg — extract audio as high-quality MP3
    // -vn       : skip video stream (audio only)
    // -b:a      : audio bitrate (user-selected: 128/192/256/320 kbps)
    // -ar 44100 : standard 44.1kHz sample rate (CD quality)
    // -ac 2     : force stereo output
    // -map_metadata 0 : copy metadata/tags from source if present
    await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-b:a', bitrate + 'k',
      '-ar', '44100',
      '-ac', '2',
      '-map_metadata', '0',
      '-y',
      outputName
    ]);

    // Read output
    progressFill.style.width = '95%';
    progressText.textContent = 'Preparing download…';

    const outputData = await ffmpeg.readFile(outputName);
    const blob = new Blob([outputData.buffer], { type: 'audio/mpeg' });

    // Cleanup virtual FS
    try { await ffmpeg.deleteFile(inputName); } catch {}
    try { await ffmpeg.deleteFile(outputName); } catch {}

    // Download
    const downloadName = selectedFile.name.replace(/\.[^.]+$/, '.mp3');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    progressFill.style.width = '100%';
    progressText.textContent = 'Complete!';
    setStatus(`✅ MP3 converted and downloaded! (${fmtSize(blob.size)})`);
    setTimeout(resetProgress, 4000);
  } catch (err) {
    setStatus(err.message || 'Conversion failed.', true);
    resetProgress();
  } finally {
    uploadConvertBtn.disabled = false;
    changeBtn.disabled = false;
  }
});
