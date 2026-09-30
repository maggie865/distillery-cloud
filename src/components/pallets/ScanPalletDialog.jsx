import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const SCANNER_ELEMENT_ID = 'pallet-qr-scanner';

// A fixed pixel qrbox (e.g. 220) throws/misbehaves whenever the actual video
// element it gets is narrower than that — very easy to hit inside a dialog
// on a real phone. A responsive function avoids that whole class of failure.
const qrboxFn = (viewfinderWidth, viewfinderHeight) => {
  const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
  return { width: edge, height: edge };
};

// Camera-based QR scanner for pallet labels, with a manual code fallback for
// when a camera isn't available or a label is damaged/unreadable.
export default function ScanPalletDialog({ open, onClose, onResolve }) {
  const scannerRef = useRef(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraError('');
    setStarting(true);

    (async () => {
      try {
        // Asking for the camera list first (rather than starting straight
        // off a { facingMode } constraint) is what actually triggers the
        // permission prompt reliably across browsers, and gives a real
        // camera id to start with instead of a constraint some devices
        // silently fail to resolve against.
        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (!devices || devices.length === 0) {
          setCameraError('No camera found on this device');
          setStarting(false);
          return;
        }
        const back = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];

        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;

        await scanner.start(
          back.id,
          { fps: 10, qrbox: qrboxFn },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true;
            scanner.stop().catch(() => {}).finally(() => onResolve(decodedText.trim()));
          },
          () => {}, // per-frame decode misses while aiming — not an error
        );
        if (!cancelled) setStarting(false);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        setCameraError(typeof err === 'string' ? err : (err?.message || 'Could not access the camera'));
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().catch(() => {}).then(() => scanner.clear?.()).catch(() => {});
      }
    };
  }, [open, onResolve]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Scan Pallet</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-1">
          <div className="relative rounded-lg overflow-hidden bg-black w-full" style={{ minHeight: 280 }}>
            <div id={SCANNER_ELEMENT_ID} className="w-full h-full" />
            {starting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 text-sm pointer-events-none">
                <Loader2 className="w-5 h-5 animate-spin" />
                Starting camera…
              </div>
            )}
          </div>
          {cameraError && (
            <p className="text-xs text-destructive">
              {cameraError} — enter the pallet code manually below instead.
            </p>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) onResolve(manualCode.trim()); }}
            className="flex gap-2"
          >
            <Input
              placeholder="Or type pallet code (e.g. PAL-00001)"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <Button type="submit">Go</Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
