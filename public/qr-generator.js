// QR Code Generator — client-side using qrcode.js
// Real-time generation as user types

const qrInput      = document.getElementById('qr-input');
const qrSize       = document.getElementById('qr-size');
const qrFg         = document.getElementById('qr-fg');
const qrBg         = document.getElementById('qr-bg');
const qrEc         = document.getElementById('qr-ec');
const qrCanvas     = document.getElementById('qr-canvas');
const qrResult     = document.getElementById('qr-result');
const qrStatus     = document.getElementById('qr-status');
const downloadPng  = document.getElementById('qr-download-png');
const downloadSvg  = document.getElementById('qr-download-svg');
const copyBtn      = document.getElementById('qr-copy');

let debounceTimer  = null;
let lastText       = '';

function setStatus(msg, isError = false) {
  qrStatus.textContent = msg;
  qrStatus.style.color = isError ? '#a12612' : '';
}

function getSafeFilename() {
  const raw = qrInput.value.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
  return raw || 'qrcode';
}

// ── Core: render QR onto canvas ──
function renderQR(text) {
  if (!text) {
    qrResult.classList.add('hidden');
    setStatus('Type something above to generate a QR code.');
    return;
  }

  const size    = parseInt(qrSize.value) || 256;
  const fgColor = qrFg.value;
  const bgColor = qrBg.value;
  const ecLevel = qrEc.value; // L M Q H

  // Map EC level to qrcode.js constant
  const ecMap = {
    L: QRCode.CorrectLevel.L,
    M: QRCode.CorrectLevel.M,
    Q: QRCode.CorrectLevel.Q,
    H: QRCode.CorrectLevel.H,
  };

  try {
    // Use a hidden div as qrcode.js renders to a div then we grab the canvas
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:absolute;left:-9999px;';
    document.body.appendChild(tempDiv);

    new QRCode(tempDiv, {
      text,
      width: size,
      height: size,
      colorDark: fgColor,
      colorLight: bgColor,
      correctLevel: ecMap[ecLevel] || QRCode.CorrectLevel.M,
    });

    // qrcode.js creates a canvas inside the div
    const generatedCanvas = tempDiv.querySelector('canvas');
    if (!generatedCanvas) throw new Error('QR canvas not found');

    // Copy to our visible canvas
    qrCanvas.width  = size;
    qrCanvas.height = size;
    const ctx = qrCanvas.getContext('2d');
    ctx.drawImage(generatedCanvas, 0, 0);

    document.body.removeChild(tempDiv);

    qrResult.classList.remove('hidden');
    setStatus(`✅ QR code ready — ${size}×${size}px`);
    lastText = text;
  } catch (err) {
    setStatus('Failed to generate QR code: text may be too long.', true);
    qrResult.classList.add('hidden');
  }
}

// ── Debounced input handler ──
function onInputChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    renderQR(qrInput.value.trim());
  }, 300);
}

const fgLabel      = document.getElementById('qr-fg-label');
const bgLabel      = document.getElementById('qr-bg-label');

qrInput.addEventListener('input', onInputChange);
qrSize.addEventListener('change', () => renderQR(qrInput.value.trim()));
qrFg.addEventListener('input', () => {
  if (fgLabel) fgLabel.textContent = qrFg.value;
  renderQR(qrInput.value.trim());
});
qrBg.addEventListener('input', () => {
  if (bgLabel) bgLabel.textContent = qrBg.value;
  renderQR(qrInput.value.trim());
});
qrEc.addEventListener('change', () => renderQR(qrInput.value.trim()));

// ── Download PNG ──
downloadPng.addEventListener('click', () => {
  if (!lastText) return;
  qrCanvas.toBlob(blob => {
    if (!blob) { setStatus('Download failed.', true); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${getSafeFilename()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus('✅ PNG downloaded!');
  }, 'image/png');
});

// ── Download SVG ──
// Build SVG manually from QR module data using qrcode.js internal API
downloadSvg.addEventListener('click', () => {
  if (!lastText) return;

  const size      = parseInt(qrSize.value) || 256;
  const fgColor   = qrFg.value;
  const bgColor   = qrBg.value;
  const ecMap     = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
  const ecLevel   = ecMap[qrEc.value] || QRCode.CorrectLevel.M;

  // We can't get module data from qrcode.js directly for SVG,
  // so convert canvas to SVG via embedding PNG data URI
  qrCanvas.toBlob(blob => {
    if (!blob) { setStatus('SVG export failed.', true); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bgColor}"/>
  <image x="0" y="0" width="${size}" height="${size}" xlink:href="${e.target.result}"/>
</svg>`;
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(svgBlob);
      a.download = `${getSafeFilename()}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatus('✅ SVG downloaded!');
    };
    reader.readAsDataURL(blob);
  }, 'image/png');
});

// ── Copy to clipboard ──
copyBtn.addEventListener('click', async () => {
  if (!lastText) return;
  try {
    const blob = await new Promise(res => qrCanvas.toBlob(res, 'image/png'));
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    copyBtn.textContent = '✅ Copied!';
    setTimeout(() => { copyBtn.textContent = '📋 Copy Image'; }, 2000);
  } catch {
    // Fallback: some browsers don't support clipboard image write
    setStatus('Copy not supported in this browser — use Download instead.', true);
  }
});
