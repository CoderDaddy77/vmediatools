// ─── Render backend URL ───
const RENDER_API = window.RENDER_API_URL || 'https://vmediatools.onrender.com';

// PPT to PDF — tries Render backend first (LibreOffice quality)
// Falls back to extracting PowerPoint's own embedded slide thumbnails
// (pixel-perfect since they're rendered by PowerPoint itself)

const dropZone        = document.getElementById('ppt-drop');
const fileInput       = document.getElementById('ppt-input');
const fileInfo        = document.getElementById('ppt-file-info');
const filenameEl      = document.getElementById('ppt-filename');
const filesizeEl      = document.getElementById('ppt-filesize');
const changeBtn       = document.getElementById('ppt-change-btn');
const controlsEl      = document.getElementById('ppt-controls');
const convertBtn      = document.getElementById('ppt-btn');
const statusNode      = document.getElementById('ppt-status');
const progressContainer = document.getElementById('ppt-progress-container');
const progressFill    = document.getElementById('ppt-progress-fill');
const progressText    = document.getElementById('ppt-progress-text');
const slidesPreview   = document.getElementById('ppt-slides-preview');
const slidesGrid      = document.getElementById('ppt-slides-grid');

let selectedFile = null;

function setStatus(msg, isError = false) {
  statusNode.textContent = msg;
  statusNode.style.color = isError ? '#a12612' : '';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function resetProgress() {
  progressContainer.classList.add('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
}

function setProgress(pct, label) {
  progressContainer.classList.remove('hidden');
  progressFill.style.width = pct + '%';
  progressText.textContent = label || pct + '%';
}

async function loadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.pptx')) {
    setStatus('Please select a valid .pptx file.', true);
    return;
  }
  selectedFile = file;
  filenameEl.textContent = file.name;
  filesizeEl.textContent = `Size: ${fmtSize(file.size)}`;
  dropZone.classList.add('hidden');
  fileInfo.classList.remove('hidden');
  controlsEl.classList.remove('hidden');
  setStatus('File loaded. Click Convert to PDF.');
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
  fileInfo.classList.add('hidden');
  controlsEl.classList.add('hidden');
  slidesPreview.classList.add('hidden');
  slidesGrid.innerHTML = '';
  dropZone.classList.remove('hidden');
  resetProgress();
  setStatus('Select a PPTX file to begin.');
});

// ─── Convert via Render backend with LIVE progress simulation ───
function convertViaServer(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const convSteps = [
      'Converting with LibreOffice…',
      'Rendering slides…',
      'Embedding fonts…',
      'Optimising layout…',
      'Generating pages…',
      'Almost done…',
    ];
    let convTicker = null;
    let convPct = 55;
    let convStepIdx = 0;

    function startConvTicker() {
      convTicker = setInterval(() => {
        if (convPct < 82) {
          const increment = (82 - convPct) * 0.045;
          convPct = Math.min(82, convPct + Math.max(0.4, increment));
        }
        const label = convSteps[convStepIdx % convSteps.length];
        setProgress(Math.round(convPct), label);
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
          const outputName = file.name.replace(/\.pptx$/i, '.pdf');
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
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => { stopConvTicker(); reject(new Error('Network error — server unreachable')); });
    xhr.addEventListener('timeout', () => { stopConvTicker(); reject(new Error('Server timed out — try a smaller file')); });

    xhr.open('POST', `${RENDER_API}/api/ppt-to-pdf`);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 150000;
    xhr.send(formData);

    setProgress(5, 'Uploading…');
    setStatus('Uploading to server…');
  });
}

// ─── Ensure jsPDF is loaded ───
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
  throw new Error('Could not load PDF library.');
}

// ─── Client-side fallback: extract PowerPoint's OWN slide thumbnails ───
// Every PPTX saved by PowerPoint contains pre-rendered PNG thumbnails in:
//   ppt/slides/slide*.png  or  ppt/media/image*.png (slide previews)
//   docProps/thumbnail.*
// These are rendered by PowerPoint itself — pixel-perfect quality.
async function convertClientSide(file) {
  setProgress(5, 'Reading file…');
  setStatus('Extracting slides…');

  await ensureJsPDF();

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  setProgress(15, 'Looking for slide previews…');

  // ── Step 1: Try to find PowerPoint's own pre-rendered slide thumbnails ──
  // PowerPoint stores PNG previews alongside each slide XML
  const slidePngPaths = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.(?:png|jpeg|jpg)$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/i)[1]);
      const nb = parseInt(b.match(/slide(\d+)/i)[1]);
      return na - nb;
    });

  // Also check docProps thumbnail
  const docThumb = Object.keys(zip.files).find(f => /^docProps\/thumbnail\./i.test(f));

  let slideImages = []; // array of {blob, type}

  if (slidePngPaths.length > 0) {
    // Found per-slide PNGs — best case, use them directly
    setStatus('Found PowerPoint slide previews — using original quality…');
    for (let i = 0; i < slidePngPaths.length; i++) {
      setProgress(15 + (i / slidePngPaths.length) * 60, `Loading slide ${i + 1}/${slidePngPaths.length}…`);
      const blob = await zip.file(slidePngPaths[i]).async('blob');
      const ext = slidePngPaths[i].split('.').pop().toLowerCase();
      slideImages.push({ blob, type: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png' });
    }
  } else {
    // ── Step 2: No per-slide PNGs — fall back to rendering slide XML on canvas ──
    // But at HIGH resolution (3x scale, PNG quality) so it still looks good
    setStatus('Rendering slides at high resolution…');
    slideImages = await renderSlidesHighRes(zip);
  }

  if (slideImages.length === 0) throw new Error('Could not extract any slides from this file.');

  // ── Build PDF from slide images ──
  setProgress(80, 'Building PDF…');

  const { jsPDF } = window.jspdf;

  // Get dimensions from first image
  const firstUrl = URL.createObjectURL(slideImages[0].blob);
  const firstImg = await loadImageAsync(firstUrl);
  const imgW = firstImg.naturalWidth;
  const imgH = firstImg.naturalHeight;
  URL.revokeObjectURL(firstUrl);

  // Use 16:9 or actual ratio — convert pixels to points (1px = 0.75pt)
  const pdfW = imgW * 0.75;
  const pdfH = imgH * 0.75;

  const pdf = new jsPDF({ unit: 'pt', format: [pdfW, pdfH], compress: true });

  slidesGrid.innerHTML = '';

  for (let i = 0; i < slideImages.length; i++) {
    setProgress(80 + (i / slideImages.length) * 18, `Page ${i + 1}/${slideImages.length}…`);

    const objUrl = URL.createObjectURL(slideImages[i].blob);
    const img = await loadImageAsync(objUrl);

    if (i > 0) pdf.addPage([pdfW, pdfH]);

    const fmt = slideImages[i].type === 'image/jpeg' ? 'JPEG' : 'PNG';
    pdf.addImage(img, fmt, 0, 0, pdfW, pdfH, undefined, 'FAST');

    // Show thumbnail preview
    const thumb = document.createElement('div');
    thumb.className = 'ppt-slide-thumb';
    const tc = document.createElement('canvas');
    const thumbH = Math.round(200 * imgH / imgW);
    tc.width = 200; tc.height = thumbH;
    tc.getContext('2d').drawImage(img, 0, 0, 200, thumbH);
    thumb.innerHTML = `<span class="ppt-slide-num">${i + 1}</span>`;
    thumb.prepend(tc);
    slidesGrid.appendChild(thumb);

    URL.revokeObjectURL(objUrl);
  }

  slidesPreview.classList.remove('hidden');

  pdf.save(file.name.replace(/\.pptx$/i, '.pdf'));
  setProgress(100, 'Complete!');
  setStatus(`✅ PDF generated (${slideImages.length} slides) — high quality`);
  setTimeout(resetProgress, 4000);
}

// ─── High-res canvas renderer ───
async function renderSlidesHighRes(zip) {
  const presXml = await zip.file('ppt/presentation.xml')?.async('text');
  if (!presXml) throw new Error('Invalid PPTX — missing presentation.xml');

  const presDoc = new DOMParser().parseFromString(presXml, 'application/xml');
  const sldSz = presDoc.querySelector('sldSz');
  const slideW = sldSz ? parseInt(sldSz.getAttribute('cx')) : 9144000;
  const slideH = sldSz ? parseInt(sldSz.getAttribute('cy')) : 6858000;
  const EMU = 914400;
  const SCALE = 3;          // 3x canvas supersampling → crisp on retina + PDF
  const PX_PER_IN = 96;
  const px = v => parseInt(v || 0) / EMU * PX_PER_IN; // EMU → px
  const slideWPx = px(slideW);
  const slideHPx = px(slideH);

  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1]) - parseInt(b.match(/slide(\d+)/)[1]));

  if (slideFiles.length === 0) throw new Error('No slides found.');

  // Load all media
  const mediaBlobs = {};
  for (const mf of Object.keys(zip.files).filter(f => f.startsWith('ppt/media/'))) {
    const blob = await zip.file(mf).async('blob');
    mediaBlobs[mf.split('/').pop()] = URL.createObjectURL(blob);
  }

  // Load theme colors (first theme only)
  const themeXml = await zip.file('ppt/theme/theme1.xml')?.async('text');
  const themeColors = {};
  if (themeXml) {
    const td = new DOMParser().parseFromString(themeXml, 'application/xml');
    const slots = ['dk1','lt1','dk2','lt2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'];
    slots.forEach(slot => {
      const el = td.querySelector(`${slot} srgbClr, ${slot} sysClr`);
      if (el) themeColors[slot] = '#' + (el.getAttribute('val') || el.getAttribute('lastClr') || '333333').replace('#','');
    });
  }
  // Defaults if theme not found
  const TC = { dk1:'#000000', lt1:'#FFFFFF', dk2:'#1F3864', lt2:'#EEEEEE',
               accent1:'#4472C4', accent2:'#ED7D31', accent3:'#A9D18E',
               accent4:'#FFC000', accent5:'#5B9BD5', accent6:'#70AD47',
               tx1:'#000000', tx2:'#595959', bg1:'#FFFFFF', bg2:'#F2F2F2', ...themeColors };

  function resolveColor(node) {
    if (!node) return null;
    const srgb = node.querySelector('srgbClr');
    if (srgb) return '#' + srgb.getAttribute('val');
    const sys = node.querySelector('sysClr');
    if (sys) return '#' + (sys.getAttribute('lastClr') || '000000');
    const sc = node.querySelector('schemeClr');
    if (sc) {
      const val = sc.getAttribute('val');
      let c = TC[val] || '#333333';
      // Apply lumMod / lumOff tints
      const lumMod = sc.querySelector('lumMod');
      const lumOff = sc.querySelector('lumOff');
      if (lumMod || lumOff) {
        let r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
        if (lumMod) { const m = parseInt(lumMod.getAttribute('val')) / 100000; r=Math.round(r*m); g=Math.round(g*m); b=Math.round(b*m); }
        if (lumOff) { const o = parseInt(lumOff.getAttribute('val')) / 100000 * 255; r=Math.min(255,r+o); g=Math.min(255,g+o); b=Math.min(255,b+o); }
        c = '#' + [r,g,b].map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
      }
      return c;
    }
    const prstClr = node.querySelector('prstClr');
    if (prstClr) {
      const presets = { black:'#000000', white:'#FFFFFF', red:'#FF0000', green:'#008000',
                        blue:'#0000FF', yellow:'#FFFF00', gray:'#808080', darkGray:'#404040' };
      return presets[prstClr.getAttribute('val')] || '#333333';
    }
    return null;
  }

  async function getSlideRels(num) {
    const relsFile = zip.file(`ppt/slides/_rels/slide${num}.xml.rels`);
    if (!relsFile) return {};
    const doc = new DOMParser().parseFromString(await relsFile.async('text'), 'application/xml');
    const rels = {};
    doc.querySelectorAll('Relationship').forEach(r => {
      rels[r.getAttribute('Id')] = r.getAttribute('Target').replace('../','').replace('media/','');
    });
    return rels;
  }

  // Load slide layout / master for default styles
  async function getSlideLayoutDefaults(slideDoc, slideNum) {
    // Try to get layout relationship
    try {
      const relsFile = zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
      if (!relsFile) return {};
      const relsDoc = new DOMParser().parseFromString(await relsFile.async('text'), 'application/xml');
      const layoutRel = [...relsDoc.querySelectorAll('Relationship')]
        .find(r => r.getAttribute('Type')?.includes('slideLayout'));
      if (!layoutRel) return {};
      const layoutPath = 'ppt/' + layoutRel.getAttribute('Target').replace('../','');
      const layoutXml = await zip.file(layoutPath)?.async('text');
      if (!layoutXml) return {};
      return new DOMParser().parseFromString(layoutXml, 'application/xml');
    } catch { return null; }
  }

  const results = [];

  for (let si = 0; si < slideFiles.length; si++) {
    setProgress(15 + (si / slideFiles.length) * 60, `Rendering slide ${si+1}/${slideFiles.length}…`);

    const slideDocText = await zip.file(slideFiles[si]).async('text');
    const slideDoc = new DOMParser().parseFromString(slideDocText, 'application/xml');
    const rels = await getSlideRels(si + 1);
    const layoutDoc = await getSlideLayoutDefaults(slideDoc, si + 1);

    const canvas = document.createElement('canvas');
    canvas.width  = slideWPx * SCALE;
    canvas.height = slideHPx * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // ── Background ──
    ctx.fillStyle = TC.bg1 || '#FFFFFF';
    ctx.fillRect(0, 0, slideWPx, slideHPx);

    const bgSolid = slideDoc.querySelector('bg > bgPr > solidFill');
    if (bgSolid) { const c = resolveColor(bgSolid); if (c) { ctx.fillStyle = c; ctx.fillRect(0, 0, slideWPx, slideHPx); } }

    const bgGrad = slideDoc.querySelector('bg > bgPr > gradFill');
    if (bgGrad && !bgSolid) {
      const stops = [...bgGrad.querySelectorAll('gs')];
      if (stops.length >= 2) {
        const grad = ctx.createLinearGradient(0, 0, slideWPx, slideHPx);
        stops.forEach(s => {
          const pos = parseInt(s.getAttribute('pos') || 0) / 100000;
          const c = resolveColor(s) || '#FFFFFF';
          try { grad.addColorStop(pos, c); } catch {}
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, slideWPx, slideHPx);
      }
    }

    // ── Shapes ──
    const shapes = slideDoc.querySelectorAll('spTree > sp, spTree > pic, spTree > graphicFrame, spTree > grpSp > sp');
    for (const shape of shapes) {
      const off = shape.querySelector('off');
      const ext = shape.querySelector('ext');
      if (!off || !ext) continue;

      const x = px(off.getAttribute('x'));
      const y = px(off.getAttribute('y'));
      const w = px(ext.getAttribute('cx'));
      const h = px(ext.getAttribute('cy'));
      if (w <= 0 || h <= 0) continue;

      // ── Picture / Image ──
      const blip = shape.querySelector('blipFill > blip');
      if (blip) {
        const rId = blip.getAttribute('r:embed') ||
          blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed');
        const mediaName = rels[rId];
        if (mediaName && mediaBlobs[mediaName]) {
          try {
            const img = await loadImageAsync(mediaBlobs[mediaName]);
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
            ctx.drawImage(img, x, y, w, h);
            ctx.restore();
          } catch {}
        }
        continue;
      }

      // ── Shape fill ──
      const spFill = shape.querySelector('spPr > solidFill') || shape.querySelector('spPr > gradFill');
      const noFill = shape.querySelector('spPr > noFill');
      if (spFill && !noFill) {
        const c = resolveColor(spFill);
        if (c) {
          ctx.fillStyle = c;
          const geomEl = shape.querySelector('prstGeom');
          const geom = geomEl?.getAttribute('prst') || 'rect';
          drawShape(ctx, geom, x, y, w, h);
        }
      }

      // ── Shape outline ──
      const lnEl = shape.querySelector('spPr > ln');
      const lnNoFill = lnEl?.querySelector('noFill');
      if (lnEl && !lnNoFill) {
        const lnFill = lnEl.querySelector('solidFill');
        const lc = lnFill ? resolveColor(lnFill) : null;
        const lw = parseInt(lnEl.getAttribute('w') || 9525) / 9525 * 0.75;
        if (lc && lw > 0) {
          ctx.strokeStyle = lc;
          ctx.lineWidth = lw;
          ctx.strokeRect(x + lw/2, y + lw/2, w - lw, h - lw);
        }
      }

      // ── Text body ──
      const txBody = shape.querySelector('txBody');
      if (!txBody) continue;

      const bodyPr = txBody.querySelector('bodyPr');
      const padL = px(bodyPr?.getAttribute('lIns') ?? 91440);
      const padR = px(bodyPr?.getAttribute('rIns') ?? 91440);
      const padT = px(bodyPr?.getAttribute('tIns') ?? 45720);
      const padB = px(bodyPr?.getAttribute('bIns') ?? 45720);
      const anchor = bodyPr?.getAttribute('anchor') || 't'; // t, ctr, b

      // Collect all paragraphs and pre-render them to measure total height
      const paragraphs = [...txBody.querySelectorAll('p')];
      const renderedParas = [];

      for (const p of paragraphs) {
        const pPr = p.querySelector('pPr');
        const algn = pPr?.getAttribute('algn') || 'l';
        const spcBef = parseInt(pPr?.querySelector('spcBef > spcPts')?.getAttribute('val') || 0) / 100;
        const spcAft = parseInt(pPr?.querySelector('spcAft > spcPts')?.getAttribute('val') || 0) / 100;
        const lnSpc = pPr?.querySelector('lnSpc > spcPct');
        const lnSpcMult = lnSpc ? parseInt(lnSpc.getAttribute('val')) / 100000 : 1.2;
        const indL = px(pPr?.getAttribute('indent') ?? 0);
        const marL = px(pPr?.getAttribute('marL') ?? 0);
        const buChar = pPr?.querySelector('buChar')?.getAttribute('char');
        const buNone = pPr?.querySelector('buNone');
        const hasBullet = buChar && !buNone;

        // Collect runs
        const runs = [...p.querySelectorAll('r')];
        const segments = runs.map(r => {
          const rPr = r.querySelector('rPr');
          const t = r.querySelector('t');
          if (!t) return null;

          // Font size resolution chain
          let sz = 18;
          if (rPr?.getAttribute('sz')) sz = parseInt(rPr.getAttribute('sz')) / 100;
          else if (pPr?.querySelector('defRPr')?.getAttribute('sz'))
            sz = parseInt(pPr.querySelector('defRPr').getAttribute('sz')) / 100;
          else if (txBody.querySelector('lstStyle > lvl1pPr > defRPr')?.getAttribute('sz'))
            sz = parseInt(txBody.querySelector('lstStyle > lvl1pPr > defRPr').getAttribute('sz')) / 100;

          const bold   = rPr?.getAttribute('b') === '1';
          const italic = rPr?.getAttribute('i') === '1';
          const underline = rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none';
          const fc = rPr?.querySelector('solidFill');
          const color = (fc ? resolveColor(fc) : null) || TC.dk1 || '#000000';

          // Font family
          const latin = rPr?.querySelector('latin');
          const fontFam = latin?.getAttribute('typeface') || 'Segoe UI';
          const safeFont = `"${fontFam}", "Calibri", Arial, sans-serif`;

          return { text: t.textContent, sz, bold, italic, underline, color, font: safeFont };
        }).filter(Boolean);

        if (segments.length === 0 && runs.length === 0) {
          // Empty paragraph — use last known size for spacing
          const lastSz = renderedParas.length > 0
            ? (renderedParas[renderedParas.length-1].lines[0]?.[0]?.sz || 14)
            : 14;
          renderedParas.push({ lines: [[{ text:'', sz: lastSz, bold:false, italic:false, color:'#000', font:'Arial' }]], algn, spcBef, spcAft, lnSpcMult, marL, indL, hasBullet, buChar });
          continue;
        }

        // Word-wrap segments into lines
        const maxW = w - padL - padR - marL - (hasBullet ? 14 : 0);
        const lines = wrapSegments(ctx, segments, maxW);
        renderedParas.push({ lines, algn, spcBef, spcAft, lnSpcMult, marL, indL, hasBullet, buChar });
      }

      // Calculate total text height
      function paraHeight(rp) {
        let h = rp.spcBef;
        rp.lines.forEach((line, li) => {
          const lineH = Math.max(...line.map(s => s.sz)) * rp.lnSpcMult;
          h += lineH;
        });
        h += rp.spcAft;
        return h;
      }
      const totalTextH = renderedParas.reduce((s, rp) => s + paraHeight(rp), 0);

      // Starting Y based on anchor
      let curY = y + padT;
      if (anchor === 'ctr') curY = y + (h - totalTextH) / 2;
      else if (anchor === 'b') curY = y + h - padB - totalTextH;

      // Draw each paragraph
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); // clip text to shape

      for (const rp of renderedParas) {
        curY += rp.spcBef;
        const shapeX = x + padL + rp.marL;
        const availW = w - padL - padR - rp.marL;

        for (let li = 0; li < rp.lines.length; li++) {
          const line = rp.lines[li];
          const lineH = Math.max(...line.map(s => s.sz), 10) * rp.lnSpcMult;
          const lineBaseY = curY + lineH * 0.8; // baseline

          // Measure line width for alignment
          let lineW = 0;
          line.forEach(seg => {
            ctx.font = buildFont(seg);
            lineW += ctx.measureText(seg.text).width;
          });

          let drawX = shapeX;
          if (rp.algn === 'ctr') drawX = shapeX + (availW - lineW) / 2;
          else if (rp.algn === 'r') drawX = shapeX + availW - lineW;

          // Bullet on first line only
          if (li === 0 && rp.hasBullet && rp.buChar) {
            const bSz = (line[0]?.sz || 14);
            ctx.font = buildFont({ sz: bSz, bold: false, italic: false, font: 'Arial' });
            ctx.fillStyle = line[0]?.color || '#000000';
            ctx.fillText(rp.buChar + ' ', drawX - 14, lineBaseY);
          }

          // Draw each segment
          for (const seg of line) {
            if (!seg.text) continue;
            ctx.font = buildFont(seg);
            ctx.fillStyle = seg.color;
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(seg.text, drawX, lineBaseY);
            if (seg.underline) {
              const tw = ctx.measureText(seg.text).width;
              ctx.strokeStyle = seg.color;
              ctx.lineWidth = Math.max(0.5, seg.sz * 0.06);
              ctx.beginPath();
              ctx.moveTo(drawX, lineBaseY + 1.5);
              ctx.lineTo(drawX + tw, lineBaseY + 1.5);
              ctx.stroke();
            }
            drawX += ctx.measureText(seg.text).width;
          }

          curY += lineH;
        }
        curY += rp.spcAft;
      }
      ctx.restore();
    }

    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    results.push({ blob, type: 'image/png' });
  }

  Object.values(mediaBlobs).forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
  return results;
}

// ── Helpers ──

function buildFont(seg) {
  const style = `${seg.italic ? 'italic ' : ''}${seg.bold ? 'bold ' : ''}`;
  return `${style}${seg.sz}px ${seg.font || '"Segoe UI", Arial, sans-serif'}`;
}

// Wrap an array of {text, sz, ...} segments into lines that fit maxW pixels
function wrapSegments(ctx, segments, maxW) {
  if (maxW <= 0) return [segments];
  const lines = [];
  let currentLine = [];
  let currentW = 0;

  // Split each segment into words, keeping track of which segment each word came from
  const tokens = []; // {word, seg, spaceAfter}
  for (const seg of segments) {
    const words = seg.text.split(/(\s+)/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === '') continue;
      const isSpace = /^\s+$/.test(w);
      tokens.push({ word: w, seg, isSpace });
    }
  }

  for (const token of tokens) {
    ctx.font = buildFont(token.seg);
    const wordW = ctx.measureText(token.word).width;

    if (token.isSpace) {
      // Add space to current line segment
      if (currentLine.length > 0) {
        const last = currentLine[currentLine.length - 1];
        if (last.seg === token.seg) {
          last.text += token.word;
        } else {
          currentLine.push({ ...token.seg, text: token.word });
        }
        currentW += wordW;
      }
      continue;
    }

    if (currentW + wordW > maxW && currentLine.length > 0) {
      // Trim trailing spaces from line
      if (currentLine.length > 0) {
        const last = currentLine[currentLine.length - 1];
        last.text = last.text.trimEnd();
      }
      lines.push(currentLine);
      currentLine = [];
      currentW = 0;
    }

    // Add word to current line
    const existing = currentLine.find(s => s.sz === token.seg.sz && s.bold === token.seg.bold &&
      s.italic === token.seg.italic && s.color === token.seg.color && s.font === token.seg.font);
    if (existing && currentLine[currentLine.length - 1] === existing) {
      existing.text += token.word;
    } else {
      currentLine.push({ ...token.seg, text: token.word });
    }
    currentW += wordW;
  }

  if (currentLine.length > 0) lines.push(currentLine);
  return lines.length > 0 ? lines : [[{ text: '', sz: 14, bold: false, italic: false, color: '#000', font: 'Arial' }]];
}

function drawShape(ctx, geom, x, y, w, h) {
  ctx.beginPath();
  if (geom === 'roundRect') {
    const r = Math.min(w, h) * 0.08;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x+r, y, r);
  } else if (geom === 'ellipse') {
    ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2);
  } else if (geom === 'triangle') {
    ctx.moveTo(x + w/2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
  } else {
    ctx.rect(x, y, w, h);
  }

  ctx.closePath();
  ctx.fill();

}

function loadImageAsync(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// --- Main convert handler ---
convertBtn.addEventListener('click', async () => {
  if (!selectedFile) { setStatus('Please upload a file first.', true); return; }
  convertBtn.disabled = true;
  changeBtn.disabled = true;

  const fileSizeMB = selectedFile.size / 1048576;

  try {
    if (fileSizeMB > 28) {
      setStatus(`Large file (${fileSizeMB.toFixed(1)} MB) — converting in browser…`);
      await convertClientSide(selectedFile);
    } else {
      try {
        await convertViaServer(selectedFile);
      } catch (serverErr) {
        console.warn('Server failed, falling back to browser:', serverErr.message);
        setStatus('Server unavailable - using browser mode...');
        setProgress(0, '');
        await convertClientSide(selectedFile);
      }
    }
  } catch (err) {
    setStatus('Conversion failed: ' + (err.message || err), true);
    resetProgress();
  } finally {
    convertBtn.disabled = false;
    changeBtn.disabled = false;
  }
});
