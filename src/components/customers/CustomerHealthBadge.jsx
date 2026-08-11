const HEALTH = {
  healthy: { label: 'Healthy', dot: 'bg-success', text: 'text-success' },
  attention: { label: 'Needs Attention', dot: 'bg-warning', text: 'text-warning' },
  at_risk: { label: 'At Risk', dot: 'bg-destructive', text: 'text-destructive' },
};

export default function CustomerHealthBadge({ health, showLabel = true, reason }) {
  const h = HEALTH[health] || HEALTH.healthy;
  return (
    <span className="inline-flex items-center gap-1.5" title={reason}>
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${h.dot}`} />
      {showLabel && <span className={`text-xs font-medium ${h.text}`}>{h.label}</span>}
    </span>
  );
}
