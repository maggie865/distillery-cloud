import { isValidElement } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

const TONES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  destructive: 'bg-destructive/10 text-destructive',
};

// Maps the ad-hoc Tailwind color classes several pages used to pass
// (color="text-purple-600" etc, one of a dozen different hues) onto the
// fixed status-tone set - keeps *some* of the original semantic intent
// (red stays alarm-ish, green stays "good") while enforcing the brief's
// "status colours only, no random coloured cards" rule.
function colorToTone(color) {
  if (!color) return 'primary';
  if (/red|destructive|rose/.test(color)) return 'destructive';
  if (/green|emerald/.test(color)) return 'success';
  if (/amber|orange|yellow/.test(color)) return 'warning';
  if (/blue|cyan|indigo|sky|purple|violet/.test(color)) return 'info';
  return 'primary';
}

/**
 * Stat tile: label -> large value (sans, never the display/serif face - a
 * hero number reads as off-brand decoration in serif) -> optional trend
 * delta -> optional muted supporting text. See dataviz skill's stat-tile
 * contract.
 *
 * Accepts both this app's original prop names (title/subtitle) and the
 * ones several report components' own local StatCard used (label/sub/
 * color/bg) so those duplicate implementations could be deleted in favor
 * of this one without touching every call site.
 */
export default function StatCard({
  title, label, value, subtitle, sub, icon, tone, color,
  trend, updated, className, onClick,
}) {
  const displayTitle = title ?? label;
  const displaySubtitle = subtitle ?? sub;
  const resolvedTone = tone ?? colorToTone(color);
  // icon may be a component reference (icon={Wine}) or an already-built
  // element (icon={<Wine className="w-4 h-4" />}) - handle both.
  const iconIsElement = isValidElement(icon);
  const IconComp = iconIsElement ? null : icon;

  const content = (
    <Card
      className={cn(
        "relative overflow-hidden p-5 text-left w-full h-full",
        onClick && "cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{displayTitle}</p>
        {(IconComp || iconIsElement) && (
          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", TONES[resolvedTone])}>
            {IconComp ? <IconComp className="w-4 h-4" /> : icon}
          </div>
        )}
      </div>

      <p className="text-3xl font-semibold text-foreground tracking-tight">{value}</p>

      {(trend || displaySubtitle) && (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {trend && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              trend.direction === 'down' ? (trend.goodDirection === 'down' ? 'text-success' : 'text-destructive')
                : (trend.goodDirection === 'down' ? 'text-destructive' : 'text-success')
            )}>
              {trend.direction === 'down' ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {trend.label}
            </span>
          )}
          {displaySubtitle && <span className="text-xs text-muted-foreground">{displaySubtitle}</span>}
        </div>
      )}

      {updated && <p className="text-[11px] text-muted-foreground/70 mt-2">{updated}</p>}
    </Card>
  );

  if (!onClick) return content;
  return <button type="button" onClick={onClick} className="text-left w-full h-full">{content}</button>;
}
