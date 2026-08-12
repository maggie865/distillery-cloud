import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

// Inject CSS once to ensure pac-container floats above dialogs/modals
function injectPacStyles() {
  if (document.getElementById('pac-style')) return;
  const style = document.createElement('style');
  style.id = 'pac-style';
  style.textContent = `.pac-container { z-index: 99999 !important; pointer-events: all !important; }`;
  document.head.appendChild(style);
}

// Global script loader
let scriptStatus = 'idle';
const listeners = [];

function loadMapsScript(apiKey) {
  if (scriptStatus === 'ready') return Promise.resolve();
  if (scriptStatus === 'loading') return new Promise((res, rej) => listeners.push({ res, rej }));
  scriptStatus = 'loading';
  return new Promise((res, rej) => {
    listeners.push({ res, rej });
    window.__mapsReady = () => {
      scriptStatus = 'ready';
      listeners.forEach(l => l.res());
      listeners.length = 0;
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=__mapsReady`;
    script.async = true;
    script.onerror = (e) => {
      scriptStatus = 'error';
      listeners.forEach(l => l.rej(e));
      listeners.length = 0;
    };
    document.head.appendChild(script);
  });
}

function getApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}

export default function AddressAutocomplete({ value, onChange, placeholder, className }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(scriptStatus);

  // Sync value into the uncontrolled input when parent changes it externally
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value || '';
    }
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    injectPacStyles();

    async function init() {
      if (scriptStatus !== 'ready') {
        setStatus('loading');
        try {
          const key = await getApiKey();
          if (!key) throw new Error('No API key');
          await loadMapsScript(key);
        } catch {
          if (!cancelled) setStatus('error');
          return;
        }
      }
      if (cancelled || !inputRef.current) return;
      setStatus('ready');

      // Set initial value into uncontrolled input
      inputRef.current.value = value || '';

      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'nz' },
        fields: ['formatted_address'],
        types: ['address'],
      });

      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const addr = place?.formatted_address || inputRef.current?.value;
        if (addr && inputRef.current) inputRef.current.value = addr;
        if (addr) onChange(addr);
      });
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        defaultValue={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={status === 'loading' ? 'Loading address search…' : (placeholder || 'Start typing an address…')}
        disabled={status === 'loading'}
        autoComplete="new-password"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
      />
      {status === 'error' && (
        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Address search unavailable — type manually
        </p>
      )}
    </div>
  );
}