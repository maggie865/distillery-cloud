import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const SCANNER_ELEMENT_ID = 'pallet-qr-scanner';

// Camera-based QR scanner for pallet labels, with a manual code fallback for
// when a camera isn't available or a label is damaged/unreadable.
export default function ScanPalletDialog({ open, onClose, onResolve }) {
  const scannerRef = useRef(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraError('');
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      (decodedText) => {
        if (cancelled) return;
        cancelled = true;
        scanner.stop().catch(() => {}).finally(() => onResolve(decodedText.trim()));
      },
      () => {}, // per-frame decode misses while aiming — not an error
    ).catch((err) => {
      setCameraError(typeof err === 'string' ? err : (err?.message || 'Could not access the camera'));
    });

    return () => {
      cancelled = true;
      scanner.stop().catch(() => {});
    };
  }, [open, onResolve]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Scan Pallet</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-1">
          <div id={SCANNER_ELEMENT_ID} className="rounded-lg overflow-hidden bg-black aspect-square w-full" />
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
