// WAV → MP3 Converter — fully client-side using lamejs
// No server dependency — all processing happens in the user's browser.

const dropZone = document.getElementById('drop-zone');
const wavInput = document.getElementById('wav-input');
const convertInfo = document.getElementById('convert-info');
const convertFilename = document.getElementById('convert-filename');
const convertFilesize = document.getElementById('convert-filesize');
const changeBtn = document.getElementById('convert-change-btn');
const convertButton = document.getElementById('convert-button');
const bitrateSelect = document.getElementById('mp3-bitrate');
const convertStatus = document.getElementById('convert-status');
const progressContainer = document.getElementById('convert-progress-container');
const progressFill = document.getElementById('convert-progress-fill');
const progressText = document.getElementById('convert-progress-text');

let selectedFile = null;

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function setStatus(msg, isError = false) {
  convertStatus.textContent = msg;
  convertStatus.style.color = isError ? '#a12612' : '';
}

function resetProgress() {
  progressContainer.classList.add('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
}

function loadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.wav')) {
    setStatus('Please select a valid .wav file.', true);
    return;
  }

  selectedFile = file;
  convertFilename.textContent = file.name;
  convertFilesize.textContent = fmtSize(file.size);

  // Hide drop zone, show file info
  dropZone.classList.add('hidden');
  convertInfo.classList.remove('hidden');

  convertButton.disabled = false;
  setStatus('Ready to convert. Pick a bitrate and click Convert to MP3.');
}

// Drop zone click

wavInput.addEventListener('change', () => {
  if (wavInput.files[0]) loadFile(wavInput.files[0]);
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

// Upload Another button — reset everything
changeBtn.addEventListener('click', () => {
  selectedFile = null;
  wavInput.value = '';
  convertFilename.textContent = '';
  convertFilesize.textContent = '';

  convertInfo.classList.add('hidden');
  dropZone.classList.remove('hidden');

  convertButton.disabled = true;
  resetProgress();
  setStatus('Select a WAV file to begin.');
});

// ─── WAV Parsing ───
function parseWavBuffer(arrayBuffer) {
  const view = new DataView(arrayBuffer);

  // Verify RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') throw new Error('Not a valid WAV file (missing RIFF header).');

  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (wave !== 'WAVE') throw new Error('Not a valid WAV file (missing WAVE format).');

  // Find the 'fmt ' chunk
  let offset = 12;
  let channels, sampleRate, bitsPerSample;

  while (offset < view.byteLength - 8) {
    const chunkId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      const audioFormat = view.getUint16(offset + 8, true);
      if (audioFormat !== 1) throw new Error('Only PCM WAV files are supported (no compression).');
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    }

    if (chunkId === 'data') {
      const dataOffset = offset + 8;
      const dataLength = chunkSize;
      return { channels, sampleRate, bitsPerSample, dataOffset, dataLength };
    }

    offset += 8 + chunkSize;
    // WAV chunks are word-aligned (2-byte)
    if (chunkSize % 2 !== 0) offset++;
  }

  throw new Error('Could not find audio data in WAV file.');
}

function extractSamples(arrayBuffer, wavInfo) {
  const { channels, bitsPerSample, dataOffset, dataLength } = wavInfo;
  const view = new DataView(arrayBuffer);
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = dataLength / bytesPerSample;
  const samplesPerChannel = totalSamples / channels;

  // lamejs expects Int16 samples, even if source is 24/32-bit
  const left = new Int16Array(samplesPerChannel);
  const right = channels > 1 ? new Int16Array(samplesPerChannel) : null;

  for (let i = 0; i < samplesPerChannel; i++) {
    const sampleIndex = i * channels;

    for (let ch = 0; ch < channels; ch++) {
      const bytePos = dataOffset + (sampleIndex + ch) * bytesPerSample;
      let sample;

      if (bitsPerSample === 16) {
        sample = view.getInt16(bytePos, true);
      } else if (bitsPerSample === 24) {
        // Convert 24-bit to 16-bit
        const b0 = view.getUint8(bytePos);
        const b1 = view.getUint8(bytePos + 1);
        const b2 = view.getUint8(bytePos + 2);
        let val = (b2 << 16) | (b1 << 8) | b0;
        if (val >= 0x800000) val -= 0x1000000;
        sample = Math.round(val / 256); // scale 24-bit to 16-bit
      } else if (bitsPerSample === 32) {
        // 32-bit float or int
        const val = view.getFloat32(bytePos, true);
        sample = Math.max(-32768, Math.min(32767, Math.round(val * 32767)));
      } else if (bitsPerSample === 8) {
        // 8-bit unsigned → 16-bit signed
        sample = (view.getUint8(bytePos) - 128) * 256;
      } else {
        sample = view.getInt16(bytePos, true);
      }

      if (ch === 0) left[i] = sample;
      else if (ch === 1) right[i] = sample;
    }
  }

  return { left, right, samplesPerChannel };
}

// ─── MP3 Encoding with lamejs ───
function encodeMp3(wavInfo, samples, bitrate, onProgress) {
  const { channels, sampleRate } = wavInfo;
  const { left, right, samplesPerChannel } = samples;

  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
  const mp3Data = [];
  const BLOCK_SIZE = 1152;

  for (let i = 0; i < samplesPerChannel; i += BLOCK_SIZE) {
    const leftChunk = left.subarray(i, i + BLOCK_SIZE);
    const rightChunk = right ? right.subarray(i, i + BLOCK_SIZE) : null;

    let mp3buf;
    if (channels === 1) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    // Progress update every 50 blocks
    if (i % (BLOCK_SIZE * 50) === 0 && onProgress) {
      onProgress(Math.min(99, Math.round((i / samplesPerChannel) * 100)));
    }
  }

  // Flush remaining data
  const mp3end = mp3encoder.flush();
  if (mp3end.length > 0) {
    mp3Data.push(mp3end);
  }

  return new Blob(mp3Data, { type: 'audio/mpeg' });
}

// ─── Convert Button ───
convertButton.addEventListener('click', async () => {
  if (!selectedFile) { setStatus('Please select a file first.', true); return; }

  convertButton.disabled = true;
  changeBtn.disabled = true;

  progressContainer.classList.remove('hidden');
  progressFill.style.width = '5%';
  progressText.textContent = 'Reading file…';
  setStatus('Reading WAV file…');

  try {
    const arrayBuffer = await selectedFile.arrayBuffer();

    progressFill.style.width = '15%';
    progressText.textContent = 'Parsing WAV…';
    setStatus('Parsing WAV header…');

    const wavInfo = parseWavBuffer(arrayBuffer);
    const samples = extractSamples(arrayBuffer, wavInfo);

    const bitrate = parseInt(bitrateSelect.value);

    progressFill.style.width = '20%';
    progressText.textContent = 'Encoding MP3…';
    setStatus(`Encoding MP3 at ${bitrate} kbps (${wavInfo.channels === 1 ? 'mono' : 'stereo'}, ${wavInfo.sampleRate} Hz)…`);

    // Give the UI a moment to update before heavy encoding
    await new Promise(r => setTimeout(r, 50));

    const mp3Blob = encodeMp3(wavInfo, samples, bitrate, (pct) => {
      const adjusted = 20 + Math.round(pct * 0.8); // scale 0-99 to 20-99
      progressFill.style.width = adjusted + '%';
      progressText.textContent = adjusted + '%';
    });

    progressFill.style.width = '100%';
    progressText.textContent = 'Complete!';
    setStatus(`✅ MP3 ready! (${fmtSize(mp3Blob.size)}) — downloading…`);

    // Trigger download
    const url = URL.createObjectURL(mp3Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name.replace(/\.wav$/i, '.mp3');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(`✅ MP3 downloaded! (${fmtSize(mp3Blob.size)} — ${bitrate} kbps)`);
    setTimeout(resetProgress, 4000);
  } catch (err) {
    setStatus(err.message || 'Conversion failed.', true);
    resetProgress();
  } finally {
    convertButton.disabled = false;
    changeBtn.disabled = false;
  }
});
