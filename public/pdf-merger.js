// PDF Merger — client-side using pdf-lib
// Drag & drop multiple PDFs, reorder, merge into one

const dropZone    = document.getElementById('pdf-drop');
const fileInput   = document.getElementById('pdf-input');
const fileInputMore = document.getElementById('pdf-input-more');
const addMoreBtn  = document.getElementById('pdf-add-more');
const listEl      = document.getElementById('pdf-list');
const controlsEl  = document.getElementById('pdf-controls');
const mergeBtn    = document.getElementById('pdf-merge-btn');
const statusNode  = document.getElementById('pdf-status');
const progressContainer = document.getElementById('pdf-progress-container');
const progressFill = document.getElementById('pdf-progress-fill');
const progressText = document.getElementById('pdf-progress-text');

let pdfs = []; // { file, name, size, pageCount }
let dragSrcIndex = null;

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

// ── Count pages in a PDF file ──
async function countPages(file) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return '?';
  }
}

// ── Add files ──
async function addFiles(files) {
  const valid = Array.from(files).filter(f =>
    f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
  if (valid.length === 0) { setStatus('Please select valid PDF files.', true); return; }

  setStatus('Reading files…');
  for (const file of valid) {
    const pageCount = await countPages(file);
    pdfs.push({ file, name: file.name, size: file.size, pageCount });
  }
  renderList();
  dropZone.classList.add('hidden');
  listEl.classList.remove('hidden');
  controlsEl.classList.remove('hidden');
  setStatus(`${pdfs.length} PDF${pdfs.length > 1 ? 's' : ''} loaded. Drag to reorder, then merge.`);
}

// ── Render list ──
function renderList() {
  listEl.innerHTML = '';
  pdfs.forEach((pdf, i) => {
    const item = document.createElement('div');
    item.className = 'pdf-item';
    item.draggable = true;
    item.dataset.index = i;
    item.innerHTML = `
      <span class="pdf-handle" title="Drag to reorder">☰</span>
      <span class="pdf-icon">📄</span>
      <div class="pdf-meta">
        <p class="pdf-name" title="${pdf.name}">${pdf.name}</p>
        <p class="pdf-size">${fmtSize(pdf.size)} · ${pdf.pageCount} page${pdf.pageCount !== 1 ? 's' : ''}</p>
      </div>
      <span class="pdf-page-num">#${i + 1}</span>
      <button class="pdf-remove" data-index="${i}" title="Remove">✕</button>
    `;

    // ── Mouse drag ──
    item.addEventListener('dragstart', e => {
      dragSrcIndex = i;
      item.classList.add('pdf-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('pdf-dragging');
      dragSrcIndex = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('pdf-drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('pdf-drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('pdf-drag-over');
      if (dragSrcIndex !== null && dragSrcIndex !== i) {
        const moved = pdfs.splice(dragSrcIndex, 1)[0];
        pdfs.splice(i, 0, moved);
        renderList();
      }
    });

    // ── Touch drag ──
    let touchSrcIndex = null;
    const handle = item.querySelector('.pdf-handle');
    handle.addEventListener('touchstart', () => {
      touchSrcIndex = i;
      item.classList.add('pdf-dragging');
    }, { passive: true });
    handle.addEventListener('touchmove', e => {
      e.preventDefault();
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.pdf-item');
      if (target && target !== item) {
        listEl.querySelectorAll('.pdf-item').forEach(el => el.classList.remove('pdf-drag-over'));
        target.classList.add('pdf-drag-over');
      }
    }, { passive: false });
    handle.addEventListener('touchend', e => {
      item.classList.remove('pdf-dragging');
      const touch = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.pdf-item');
      if (target) {
        const destIndex = parseInt(target.dataset.index);
        target.classList.remove('pdf-drag-over');
        if (touchSrcIndex !== null && touchSrcIndex !== destIndex) {
          const moved = pdfs.splice(touchSrcIndex, 1)[0];
          pdfs.splice(destIndex, 0, moved);
          renderList();
        }
      }
      touchSrcIndex = null;
    });

    // ── Remove ──
    item.querySelector('.pdf-remove').addEventListener('click', () => {
      pdfs.splice(i, 1);
      if (pdfs.length === 0) {
        listEl.classList.add('hidden');
        controlsEl.classList.add('hidden');
        dropZone.classList.remove('hidden');
        setStatus('Select two or more PDF files to begin.');
      } else {
        renderList();
        setStatus(`${pdfs.length} PDF${pdfs.length > 1 ? 's' : ''} loaded.`);
      }
    });

    listEl.appendChild(item);
  });
}

// ── Drop zone ──

fileInput.addEventListener('change', () => { if (fileInput.files.length) addFiles(fileInput.files); });
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

// ── Add more ──
addMoreBtn.addEventListener('click', () => fileInputMore.click());
fileInputMore.addEventListener('change', () => {
  if (fileInputMore.files.length) addFiles(fileInputMore.files);
  fileInputMore.value = '';
});

// ── Merge ──
mergeBtn.addEventListener('click', async () => {
  if (pdfs.length < 2) {
    setStatus('Add at least 2 PDF files to merge.', true);
    return;
  }

  mergeBtn.disabled = true;
  resetProgress();
  setStatus('Merging PDFs…');

  try {
    const merged = await PDFLib.PDFDocument.create();

    for (let i = 0; i < pdfs.length; i++) {
      setProgress(
        Math.round((i / pdfs.length) * 90),
        `Copying pages from "${pdfs[i].name}"… (${i + 1}/${pdfs.length})`
      );

      const bytes = await pdfs[i].file.arrayBuffer();
      let srcDoc;
      try {
        srcDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch (err) {
        throw new Error(`Could not read "${pdfs[i].name}" — it may be password-protected.`);
      }

      const pageIndices = srcDoc.getPageIndices();
      const copiedPages = await merged.copyPages(srcDoc, pageIndices);
      copiedPages.forEach(page => merged.addPage(page));

      // yield to browser so UI updates
      await new Promise(r => setTimeout(r, 0));
    }

    setProgress(95, 'Saving merged PDF…');

    const mergedBytes = await merged.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'merged.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    const totalPages = pdfs.reduce((s, p) => s + (typeof p.pageCount === 'number' ? p.pageCount : 0), 0);
    setProgress(100, '✅ Done!');
    setStatus(`✅ Merged ${pdfs.length} PDFs (${totalPages} pages total) — ${fmtSize(blob.size)}`);
    setTimeout(resetProgress, 4000);

  } catch (err) {
    setStatus('Merge failed: ' + (err.message || err), true);
    resetProgress();
  } finally {
    mergeBtn.disabled = false;
  }
});
