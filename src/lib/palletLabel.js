import QRCode from 'qrcode';

// A pallet's contents change over time (items get added/removed), so the
// label only prints the code + QR — scanning it always shows the live
// contents rather than a snapshot that can go stale.
export async function printPalletLabel(pallet) {
  // Safari (especially iOS) only allows window.open() to succeed when it's
  // called synchronously inside the click handler — any await before it
  // (even a fast one, like generating the QR code) breaks that and the
  // popup gets silently blocked, or opens a stray blank tab the user has
  // no obvious way back from. Open the window immediately with a loading
  // placeholder, then fill it in once the QR code is ready.
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to print the pallet label.');
    return;
  }
  win.document.write('<!DOCTYPE html><title>Preparing label…</title><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#666">Preparing label…</body>');
  win.document.close();

  const qrDataUrl = await QRCode.toDataURL(pallet.pallet_code, { width: 260, margin: 1 });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Pallet Label ${pallet.pallet_code}</title>
<style>
  @page { size: 100mm 150mm; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }
  .label { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .code { font-size: 22pt; font-weight: bold; letter-spacing: 1px; }
  .qr { width: 220px; height: 220px; }
  .location { font-size: 12pt; font-weight: 600; text-transform: uppercase; }
  .hint { font-size: 9pt; color: #444; }
</style>
</head>
<body>
  <div class="label">
    <div class="code">${pallet.pallet_code}</div>
    <img class="qr" src="${qrDataUrl}" alt="QR code" />
    <div class="location">${pallet.location || ''}</div>
    <div class="hint">Scan with the Congener app to see contents</div>
  </div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}
