import { cn } from '@/lib/utils';

/**
 * Elegant stainless-steel cylindrical tank illustration with a dynamic
 * liquid fill. The outline is drawn in SVG (steel gradient, rim, ribs); the
 * liquid itself is a plain HTML layer with a CSS height transition, which is
 * far simpler than animating an SVG clip path and looks identical.
 */
export default function TankVisual({ pct = 0, empty = false }) {
  const clamped = Math.min(100, Math.max(0, pct));

  return (
    <div className="relative w-40 sm:w-48 mx-auto select-none" style={{ aspectRatio: '3 / 5' }}>
      <svg viewBox="0 0 120 200" className="absolute inset-0 w-full h-full drop-shadow-sm" aria-hidden="true">
        <defs>
          <linearGradient id="tankSteel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e7e5e2" />
            <stop offset="12%" stopColor="#f8f7f5" />
            <stop offset="30%" stopColor="#cfccc7" />
            <stop offset="55%" stopColor="#f4f3f1" />
            <stop offset="80%" stopColor="#d8d5d0" />
            <stop offset="100%" stopColor="#c3c0bb" />
          </linearGradient>
          <linearGradient id="tankLid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d8d5d0" />
            <stop offset="100%" stopColor="#b8b5b0" />
          </linearGradient>
          <clipPath id="tankBodyClip">
            <path d="M8 24 L8 176 Q8 192 60 192 Q112 192 112 176 L112 24 Z" />
          </clipPath>
        </defs>

        {/* Body outline */}
        <path
          d="M8 24 L8 176 Q8 192 60 192 Q112 192 112 176 L112 24 Z"
          fill="url(#tankSteel)"
          stroke="#b0ada7"
          strokeWidth="1.5"
        />

        {/* Liquid fill, clipped to the body silhouette */}
        <g clipPath="url(#tankBodyClip)">
          <rect
            x="0"
            y={200 - clamped * 1.85}
            width="120"
            height="200"
            fill={empty ? 'transparent' : 'url(#tankLiquid)'}
            style={{ transition: 'y 700ms cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
          {!empty && clamped > 0 && (
            <rect
              x="0"
              y={200 - clamped * 1.85}
              width="120"
              height="3"
              fill="#e9a765"
              opacity="0.9"
              style={{ transition: 'y 700ms cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          )}
        </g>
        <defs>
          <linearGradient id="tankLiquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d98f4e" />
            <stop offset="100%" stopColor="#a9622c" />
          </linearGradient>
        </defs>

        {/* Ribs for an industrial steel look */}
        <line x1="8" y1="65" x2="112" y2="65" stroke="#b0ada7" strokeWidth="1" opacity="0.5" />
        <line x1="8" y1="112" x2="112" y2="112" stroke="#b0ada7" strokeWidth="1" opacity="0.5" />
        <line x1="8" y1="159" x2="112" y2="159" stroke="#b0ada7" strokeWidth="1" opacity="0.5" />

        {/* Body outline drawn again on top so ribs/liquid never bleed past it */}
        <path
          d="M8 24 L8 176 Q8 192 60 192 Q112 192 112 176 L112 24 Z"
          fill="none"
          stroke="#a9a59f"
          strokeWidth="1.5"
        />

        {/* Lid */}
        <ellipse cx="60" cy="24" rx="52" ry="10" fill="url(#tankLid)" stroke="#a9a59f" strokeWidth="1.5" />
        <ellipse cx="60" cy="21" rx="44" ry="6" fill="#eceae7" opacity="0.7" />

        {/* Small top nozzle */}
        <rect x="52" y="6" width="16" height="10" rx="2" fill="#c3c0bb" stroke="#a9a59f" strokeWidth="1" />
      </svg>

      {empty && (
        <div className="absolute inset-0 flex items-center justify-center pt-6">
          <span className="text-xs font-medium text-muted-foreground bg-card/90 px-2 py-1 rounded-full border border-border">Empty</span>
        </div>
      )}
    </div>
  );
}

export function TankVisualCaption({ volume, unit = 'L', abv, pct, className }) {
  return (
    <div className={cn('text-center mt-4 space-y-0.5', className)}>
      <p className="text-2xl font-semibold text-foreground tracking-tight">
        {volume != null ? `${Number(volume).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}` : '—'}
      </p>
      <p className="text-sm text-muted-foreground">
        {abv != null ? `${Number(abv).toFixed(1)}% ABV` : 'ABV not recorded'}
        {pct != null && <span> · {Math.round(pct)}% capacity</span>}
      </p>
    </div>
  );
}
