export default function ProjectActivity({ history }) {
  const list = Array.isArray(history) ? history.slice().reverse() : [];
  if (list.length === 0) return <div className="muted-text">אין פעילות מתועדת</div>;

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="timeline">
      {list.map((entry) => (
        <div key={entry.id || `${entry.at}-${entry.action}`} className="timeline-item">
          <div className="timeline-dot" />
          <div className="timeline-content">
            <div className="timeline-meta">
              <strong>{entry.byDisplay || entry.by || 'לא ידוע'}</strong>
              <span>{fmt(entry.at)}</span>
            </div>
            <div>{entry.summary || entry.action}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
