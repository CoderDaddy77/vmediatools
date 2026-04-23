// ─── Render backend URL ───
const RENDER_API = window.RENDER_API_URL || 'https://vera-media-tools-backend.onrender.com';

// Word to PDF — tries Render backend first (LibreOffice quality)
// Falls back to client-side mammoth.js + html2canvas + jsPDF

const dropZone = document.getElementById('w2p-drop');
const fileInput = document.getElementById('w2p-input');
const fileInfo = document.getElementById('w2p-file-info');
const filenameEl = document.getElementById('w2p-filename');
const filesizeEl = document.getElementById('w2p-filesize');
const changeBtn = document.getElementById('w2p-change-btn');
const controlsEl = document.getElementById('w2p-controls');
const pageSizeSelect = document.getElementById('w2p-page-size');
const convertBtn = document.getElementById('w2p-btn');
const statusNode = document.getElementById('w2p-status');
const progressContainer = document.getElementById('w2p-progress-container');
const progressFill = document.getElementById('w2p-progress-fill');
const progressText = document.getElementById('w2p-progress-text');
const previewSection = document.getElementById('w2p-preview');
const previewContent = document.getElementById('w2p-preview-content');

let selectedFile = null;
let htmlContent = '';

function setStatus(msg, isError = false) {
  statusNode.textContent = msg;
  statusNode.style.color = isError ? '#a12612' : '';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
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

async function loadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.docx')) {
    setStatus('Please select a valid .docx file.', true);
    return;
  }
  selectedFile = file;
  filenameEl.textContent = file.name;
  filesizeEl.textContent = `Size: ${fmtSize(file.size)}`;
  setStatus('Parsing document preview…');

  // Show file info immediately — convert via server works even without preview
  dropZone.classList.add('hidden');
  fileInfo.classList.remove('hidden');
  controlsEl.classList.remove('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    htmlContent = result.value;
    if (htmlContent) {
      previewContent.innerHTML = htmlContent;
      previewSection.classList.remove('hidden');
    }
    setStatus('Document ready. Click Convert to PDF.');
  } catch (err) {
    // Preview failed (e.g. complex DOCX with SmartArt/charts) — server conversion still works
    console.warn('Mammoth preview error (non-fatal):', err.message);
    setStatus('Preview unavailable for this file — you can still convert via server. Click Convert to PDF.');
  }
}

// Drop zone
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

// Upload Another
changeBtn.addEventListener('click', () => {
  fileInput.value = '';
  selectedFile = null;
  htmlContent = '';
  fileInfo.classList.add('hidden');
  controlsEl.classList.add('hidden');
  previewSection.classList.add('hidden');
  dropZone.classList.remove('hidden');
  resetProgress();
  setStatus('Select a DOCX file to begin.');
});

// ─── Convert via Render backend with LIVE progress ───
function convertViaServer(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const convSteps = [
      'Converting with LibreOffice…',
      'Processing document…',
      'Embedding fonts…',
      'Building PDF pages…',
      'Almost done…',
    ];
    let convTicker = null;
    let convPct = 55;
    let convStepIdx = 0;

    function startConvTicker() {
      convTicker = setInterval(() => {
        if (convPct < 82) {
          convPct = Math.min(82, convPct + Math.max(0.4, (82 - convPct) * 0.045));
        }
        setProgress(Math.round(convPct), convSteps[convStepIdx % convSteps.length]);
        convStepIdx++;
      }, 1200);
    }

    function stopConvTicker() {
      if (convTicker) { clearInterval(convTicker); convTicker = null; }
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 45) + 5;
        const mb = (e.loaded / 1048576).toFixed(1);
        const total = (e.total / 1048576).toFixed(1);
        setProgress(pct, `Uploading… ${mb} MB / ${total} MB`);
      }
    });

    xhr.upload.addEventListener('load', () => {
      setProgress(52, 'Upload complete — starting conversion…');
      setStatus('LibreOffice is converting your file…');
      setTimeout(() => { convPct = 55; startConvTicker(); }, 600);
    });

    xhr.addEventListener('load', () => {
      stopConvTicker();
      if (xhr.status === 200) {
        setProgress(88, 'Packaging PDF…');
        setStatus('Preparing download…');
        setTimeout(() => {
          const blob = new Blob([xhr.response], { type: 'application/pdf' });
          const outputName = file.name.replace(/\.docx$/i, '.pdf');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = outputName;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          setProgress(100, '✅ Done!');
          setStatus(`✅ PDF downloaded! (${fmtSize(blob.size)}) — LibreOffice quality`);
          setTimeout(resetProgress, 3500);
          resolve();
        }, 400);
      } else {
        let msg = `Server error ${xhr.status}`;
        try { msg = JSON.parse(new TextDecoder().decode(xhr.response)).error || msg; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => { stopConvTicker(); reject(new Error('Network error')); });
    xhr.addEventListener('abort', () => { stopConvTicker(); reject(new Error('Request aborted')); });

    xhr.open('POST', `${RENDER_API}/api/word-to-pdf`);
    xhr.responseType = 'arraybuffer';
    xhr.send(formData);
  });
}

// ─── Client-side fallback (html2canvas + jsPDF) ───
async function convertClientSide(file) {
  if (!htmlContent) throw new Error('No document content to convert.');

  setProgress(10, 'Rendering…');
  setStatus('Converting in browser (client-side fallback)…');

  const pageSize = pageSizeSelect.value;
  const isA4 = pageSize === 'a4';
  const pageWidthMM = isA4 ? 210 : 215.9;
  const pageHeightMM = isA4 ? 297 : 279.4;
  const marginMM = 15;
  const dpi = 2;
  const pageWidthPx = Math.round((pageWidthMM - marginMM * 2) * 3.78 * dpi);

  const renderDiv = document.createElement('div');
  renderDiv.style.cssText = `position:absolute;left:-9999px;top:0;width:${pageWidthPx/dpi}px;background:white;font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#111;`;

  const styleEl = document.createElement('style');
  styleEl.textContent = `.w2p-render h1{font-size:20pt;font-weight:700;margin:16px 0 8px}.w2p-render h2{font-size:16pt;font-weight:700;margin:14px 0 6px}.w2p-render p{margin:6px 0}.w2p-render ul,.w2p-render ol{margin:6px 0;padding-left:24px}.w2p-render table{border-collapse:collapse;width:100%;margin:10px 0}.w2p-render td,.w2p-render th{border:1px solid #ccc;padding:6px 8px}.w2p-render th{background:#f3f3f3;font-weight:700}`;
  renderDiv.appendChild(styleEl);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'w2p-render';
  contentDiv.innerHTML = htmlContent;
  renderDiv.appendChild(contentDiv);
  document.body.appendChild(renderDiv);

  setProgress(30, 'Capturing…');
  await new Promise(r => setTimeout(r, 300));

  const canvas = await html2canvas(renderDiv, { scale: dpi, useCORS: true, backgroundColor: '#ffffff', logging: false });
  document.body.removeChild(renderDiv);

  setProgress(60, 'Building PDF…');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: isA4 ? 'a4' : 'letter', orientation: 'portrait' });
  const imgWidth = pageWidthMM - marginMM * 2;
  const ratio = canvas.width / (imgWidth * (96/25.4) * dpi);
  const imgHeight = canvas.height / ratio / (96/25.4) / dpi;
  const contentHeight = pageHeightMM - marginMM * 2;
  let heightLeft = imgHeight, position = 0, page = 0;

  while (heightLeft > 0) {
    if (page > 0) pdf.addPage();
    const sliceH = Math.min(contentHeight * (96/25.4) * dpi * ratio, canvas.height - position * (96/25.4) * dpi * ratio);
    const pc = document.createElement('canvas');
    pc.width = canvas.width;
    pc.height = Math.round(sliceH);
    const pctx = pc.getContext('2d');
    pctx.fillStyle = '#fff';
    pctx.fillRect(0, 0, pc.width, pc.height);
    pctx.drawImage(canvas, 0, Math.round(position * (96/25.4) * dpi * ratio), canvas.width, Math.round(sliceH), 0, 0, pc.width, Math.round(sliceH));
    const sliceHMM = Math.min(contentHeight, heightLeft);
    pdf.addImage(pc.toDataURL('image/jpeg', 0.95), 'JPEG', marginMM, marginMM, imgWidth, sliceHMM);
    heightLeft -= contentHeight;
    position += contentHeight;
    page++;
    setProgress(60 + Math.round(page / Math.ceil(imgHeight / contentHeight) * 35), `Page ${page}…`);
  }

  pdf.save(file.name.replace(/\.docx$/i, '.pdf'));
  setProgress(100, 'Complete!');
  setStatus(`✅ PDF generated! ${page} page${page > 1 ? 's' : ''} — browser mode`);
  setTimeout(resetProgress, 4000);
}

// ─── Main convert handler ───
convertBtn.addEventListener('click', async () => {
  if (!selectedFile) { setStatus('Please upload a file first.', true); return; }
  convertBtn.disabled = true;
  changeBtn.disabled = true;

  try {
    try {
      await convertViaServer(selectedFile);
    } catch (serverErr) {
      console.warn('Server failed, falling back to browser:', serverErr.message);
      setStatus('Server busy, switching to browser mode…');
      await convertClientSide(selectedFile);
    }
  } catch (err) {
    setStatus('Conversion failed: ' + (err.message || err), true);
    resetProgress();
  } finally {
    convertBtn.disabled = false;
    changeBtn.disabled = false;
  }
});
