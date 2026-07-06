const STATUS_DEFAULTS = {
  active:   { label: 'פעיל',     dotColor: '#22C55E' },
  inactive: { label: 'לא פעיל',  dotColor: '#EF4444' },
  forming:  { label: 'בהתהוות',  dotColor: '#FBBF24' },
  archived: { label: 'ארכיון',   dotColor: '#94A3B8' },
};

export default function StatusBadge({ status, labels = {} }) {
  const defaults = STATUS_DEFAULTS[status] || { label: status || 'לא מוגדר', dotColor: '#94A3B8' };
  const label = labels[status] || defaults.label;
  const dotColor = defaults.dotColor;

  return (
    <span className={`badge badge-${status || 'archived'}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span className="status-dot" style={{ background: dotColor }} />
      {label}
    </span>
  );
}
