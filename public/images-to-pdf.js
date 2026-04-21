// Images to PDF — client-side using jsPDF
// Drag & drop multiple images, reorder, combine into a single PDF

const dropZone      = document.getElementById('img2pdf-drop');
const fileInput     = document.getElementById('img2pdf-input');
const fileInputMore = document.getElementById('img2pdf-input-more');
const addMoreBtn    = document.getElementById('img2pdf-add-more');
const listEl        = document.getElementById('img2pdf-list');
const controlsEl    = document.getElementById('img2pdf-controls');
const orientationSel = document.getElementById('img2pdf-orientation');
const marginSel     = document.getElementById('img2pdf-margin');
const qualitySlider = document.getElementById('img2pdf-quality');
const qualityVal    = document.getElementById('img2pdf-quality-val');
const genBtn        = document.getElementById('img2pdf-btn');
const statusNode    = document.getElementById('img2pdf-status');

let images = []; // { file, dataUrl (display), pdfDataUrl (PDF), pdfFmt, width, height }
let dragSrcIndex = null;

// ── Quality slider display ──
if (qualitySlider && qualityVal) {
  qualitySlider.addEventListener('input', () => { qualityVal.textContent = qualitySlider.value; });
}

function setStatus(msg, isError = false) {
  statusNode.textContent = msg;
  statusNode.style.color = isError ? '#a12612' : '';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ── Ensure jsPDF is available ──
async function ensureJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return;
  const cdns = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  ];
  for (const cdn of cdns) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = cdn; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      if (window.jspdf && window.jspdf.jsPDF) return;
    } catch {}
  }
  throw new Error('Could not load PDF library. Check your internet connection.');
}

// ── Load image + canvas-render to a PDF-compatible format ──
// jsPDF only natively supports JPEG and PNG.
// WebP and BMP must be converted via Canvas.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;

        // Render to canvas for universal PDF compatibility
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // Fill white background for JPEG (no transparency support)
        const useJpeg = file.type !== 'image/png';
        if (useJpeg) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0);

        const pdfFmt   = useJpeg ? 'JPEG' : 'PNG';
        const mimeType = useJpeg ? 'image/jpeg' : 'image/png';
        // Quality applied at generation time for JPEG
        const pdfDataUrl = canvas.toDataURL(mimeType, 0.95);

        resolve({ file, dataUrl: e.target.result, pdfDataUrl, pdfFmt, width: w, height: h });
      };
      img.onerror = () => reject(new Error('Failed to load: ' + file.name));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read: ' + file.name));
    reader.readAsDataURL(file);
  });
}

async function addFiles(files) {
  const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/jpg'];
  const newFiles = Array.from(files).filter(f =>
    validTypes.includes(f.type) || f.name.match(/\.(png|jpe?g|webp|bmp)$/i)
  );

  if (newFiles.length === 0) { setStatus('No valid image files selected.', true); return; }

  setStatus('Loading images…');
  for (const f of newFiles) {
    try {
      const imgData = await loadImage(f);
      images.push(imgData);
    } catch (err) {
      console.warn(err.message);
    }
  }

  renderList();
  dropZone.classList.add('hidden');
  listEl.classList.remove('hidden');
  controlsEl.classList.remove('hidden');
  setStatus(`${images.length} image${images.length > 1 ? 's' : ''} ready. Drag to reorder, then generate PDF.`);
}

// ── Render image list with drag-reorder (mouse + touch) ──
function renderList() {
  listEl.innerHTML = '';
  images.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'img2pdf-item';
    item.draggable = true;
    item.dataset.index = i;

    item.innerHTML = `
      <div class="img2pdf-handle" title="Drag to reorder">☰</div>
      <img src="${img.dataUrl}" class="img2pdf-thumb" alt="Page ${i + 1}" loading="lazy" />
      <div class="img2pdf-meta">
        <p class="img2pdf-name">${img.file.name}</p>
        <p class="img2pdf-dims">${img.width}×${img.height} · ${fmtSize(img.file.size)}</p>
      </div>
      <span class="img2pdf-page-num">#${i + 1}</span>
      <button class="img2pdf-remove" data-index="${i}" title="Remove">✕</button>
    `;

    // ── Mouse drag ──
    item.addEventListener('dragstart', (e) => {
      dragSrcIndex = i;
      item.classList.add('img2pdf-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('img2pdf-dragging');
      dragSrcIndex = null;
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('img2pdf-drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('img2pdf-drag-over'));
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('img2pdf-drag-over');
      if (dragSrcIndex !== null && dragSrcIndex !== i) {
        const moved = images.splice(dragSrcIndex, 1)[0];
        images.splice(i, 0, moved);
        renderList();
      }
    });

    // ── Touch drag (mobile reorder) ──
    const handle = item.querySelector('.img2pdf-handle');
    let touchSrcIndex = null;

    handle.addEventListener('touchstart', (e) => {
      touchSrcIndex = i;
      item.classList.add('img2pdf-dragging');
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.img2pdf-item');
      if (target && target !== item) {
        listEl.querySelectorAll('.img2pdf-item').forEach(el => el.classList.remove('img2pdf-drag-over'));
        target.classList.add('img2pdf-drag-over');
      }
    }, { passive: false });

    handle.addEventListener('touchend', (e) => {
      item.classList.remove('img2pdf-dragging');
      const touch = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.img2pdf-item');
      if (target) {
        const destIndex = parseInt(target.dataset.index);
        target.classList.remove('img2pdf-drag-over');
        if (touchSrcIndex !== null && touchSrcIndex !== destIndex) {
          const moved = images.splice(touchSrcIndex, 1)[0];
          images.splice(destIndex, 0, moved);
          renderList();
        }
      }
      touchSrcIndex = null;
    });

    // ── Remove ──
    item.querySelector('.img2pdf-remove').addEventListener('click', () => {
      images.splice(i, 1);
      if (images.length === 0) {
        listEl.classList.add('hidden');
        controlsEl.classList.add('hidden');
        dropZone.classList.remove('hidden');
        setStatus('Select images to begin.');
      } else {
        renderList();
        setStatus(`${images.length} image${images.length > 1 ? 's' : ''} ready.`);
      }
    });

    listEl.appendChild(item);
  });
}

// ── Drop zone ──
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files.length) addFiles(fileInput.files); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
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

// ── Generate PDF ──
genBtn.addEventListener('click', async () => {
  if (images.length === 0) { setStatus('Add images first.', true); return; }

  genBtn.disabled = true;
  setStatus('Preparing PDF…');

  try {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;

    // User settings
    const orientation = orientationSel.value;
    const marginPx    = parseInt(marginSel.value) || 0;
    const quality     = qualitySlider ? parseInt(qualitySlider.value) / 100 : 1.0;

    // Fixed page sizes in mm
    const pageSizes = {
      'a4-portrait':      [210, 297],
      'a4-landscape':     [297, 210],
      'letter-portrait':  [215.9, 279.4],
      'letter-landscape': [279.4, 215.9],
    };

    // A4 width in pt cap for auto mode
    const MAX_PT = 595.28;

    let pdf = null;

    for (let idx = 0; idx < images.length; idx++) {
      const img = images[idx];
      const imgRatio = img.width / img.height;

      let unit, pageW, pageH, drawX, drawY, drawW, drawH;

      if (orientation === 'auto') {
        // Page exactly fits image, capped to A4 width
        unit = 'pt';
        const marginPt = marginPx * 0.75; // px → pt
        const rawW = img.width * 0.75;    // px → pt
        const rawH = img.height * 0.75;
        const scale = rawW > MAX_PT - marginPt * 2 ? (MAX_PT - marginPt * 2) / rawW : 1;
        drawW  = rawW * scale;
        drawH  = rawH * scale;
        pageW  = drawW + marginPt * 2;
        pageH  = drawH + marginPt * 2;
        drawX  = marginPt;
        drawY  = marginPt;
      } else {
        // Fixed page sizes — image scaled to fit with uniform margin
        unit = 'mm';
        const [pw, ph] = pageSizes[orientation];
        pageW = pw;
        pageH = ph;
        const marginMm = marginPx * 0.2646; // px → mm
        const availW   = pageW - marginMm * 2;
        const availH   = pageH - marginMm * 2;
        const pageRatio = availW / availH;

        if (imgRatio > pageRatio) {
          drawW = availW;
          drawH = availW / imgRatio;
        } else {
          drawH = availH;
          drawW = availH * imgRatio;
        }
        // Centre on page
        drawX = marginMm + (availW - drawW) / 2;
        drawY = marginMm + (availH - drawH) / 2;
      }

      // Explicitly tell jsPDF the orientation so it never swaps dimensions
      const orient = pageW >= pageH ? 'landscape' : 'portrait';

      if (idx === 0) {
        pdf = new jsPDF({ unit, format: [pageW, pageH], orientation: orient, compress: true });
      } else {
        pdf.addPage([pageW, pageH], orient);
      }

      // Re-encode JPEG with user quality if needed
      let pdfDataUrl = img.pdfDataUrl;
      if (img.pdfFmt === 'JPEG' && quality < 1.0) {
        const tempImg = new Image();
        await new Promise(r => { tempImg.onload = r; tempImg.src = img.dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(tempImg, 0, 0);
        pdfDataUrl = c.toDataURL('image/jpeg', quality);
      }

      pdf.addImage(pdfDataUrl, img.pdfFmt, drawX, drawY, drawW, drawH);
      setStatus(`Processing page ${idx + 1} of ${images.length}… (${Math.round(((idx + 1) / images.length) * 100)}%)`);
      await new Promise(r => setTimeout(r, 0)); // yield to browser
    }

    pdf.save('images-combined.pdf');
    setStatus(`✅ PDF saved — ${images.length} page${images.length > 1 ? 's' : ''} combined successfully!`);
  } catch (err) {
    setStatus('PDF generation failed: ' + (err.message || err), true);
    console.error(err);
  } finally {
    genBtn.disabled = false;
  }
});
