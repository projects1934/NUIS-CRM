/* eslint-disable react-hooks/purity, react-refresh/only-export-components */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, apiJson } from './api';
import { showToast } from './Toast';

const PRIORITY_REPS = { high: 3, medium: 2, low: 1 };

function PriorityChip({ value, emojiChar }) {
  if (!value) return null;
  const reps = PRIORITY_REPS[value] || 0;
  return <span className="priority-chip">{emojiChar.repeat(reps)}</span>;
}

function DueChip({ value }) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return null;
  const days = Math.ceil((ts - Date.now()) / 86400000);
  let cls = 'due-chip';
  if (days < 0) cls += ' due-chip-overdue';
  else if (days <= 7) cls += ' due-chip-soon';
  return <span className={cls}>{formatDate(value)}</span>;
}

export default function KanbanBoard({ projects, stageOptions, allPartners, onMutated, readOnly = false, priorityEmoji = '🔥' }) {
  const [draggingId, setDraggingId] = useState(null);
  const navigate = useNavigate();

  const columns = [
    ...stageOptions.map((s) => ({ key: s.label, label: s.label, color: s.color })),
    { key: '__none__', label: 'ללא שלב', color: 'var(--neutral-bg)' },
  ];

  const byStage = {};
  for (const c of columns) byStage[c.key] = [];
  for (const p of projects) {
    const key = p.stage && byStage[p.stage] ? p.stage : '__none__';
    byStage[key].push(p);
  }

  const partnerName = (partnerId) =>
    allPartners.find((ap) => ap.id === partnerId)?.organizationName || '';

  const handleDrop = async (project, columnKey) => {
    if (readOnly) return;
    const newStage = columnKey === '__none__' ? '' : columnKey;
    if ((project.stage || '') === newStage) return;
    try {
      await apiJson(`/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify({ stage: newStage }),
      });
      onMutated?.();
    } catch {
      showToast('העברת הפרויקט נכשלה', 'error');
    }
  };

  return (
    <div className="kanban-board">
      {columns.map((col) => (
        <div
          key={col.key}
          className="kanban-column"
          onDragOver={(e) => { if (!readOnly) e.preventDefault(); }}
          onDrop={() => {
            if (readOnly || !draggingId) return;
            const proj = projects.find((p) => p.id === draggingId);
            if (proj) handleDrop(proj, col.key);
            setDraggingId(null);
          }}
        >
          <div className="kanban-column-header" style={{ borderTopColor: col.color || 'var(--primary-color)' }}>
            <span>{col.label}</span>
            <span className="kanban-count">{byStage[col.key].length}</span>
          </div>
          <div className="kanban-column-body">
            {byStage[col.key].length === 0 && !readOnly && (
              <div className="kanban-empty">גרור פרויקט לכאן</div>
            )}
            {byStage[col.key].map((p) => {
              const partnerNames = (p.partners || []).map((lp) => partnerName(lp.partner_id)).filter(Boolean);
              const taskCount = (p.tasks || []).length;
              const taskDone = (p.tasks || []).filter((t) => t.completed).length;
              return (
                <div
                  key={p.id}
                  className="kanban-card clickable-card"
                  draggable={!readOnly}
                  onDragStart={() => setDraggingId(p.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <div className="kanban-card-title">{p.title}</div>
                  <div className="kanban-card-meta">
                    <PriorityChip value={p.priority} emojiChar={priorityEmoji} />
                    <DueChip value={p.due_date} />
                    {p.owner && <span className="owner-bubble" title={p.owner}>{p.owner.slice(0, 2)}</span>}
                  </div>
                  {partnerNames.length > 0 && (
                    <div className="kanban-card-partners">
                      {partnerNames.slice(0, 3).map((n) => <span key={n} className="partner-chip">{n}</span>)}
                      {partnerNames.length > 3 && <span className="partner-chip partner-chip-more">+{partnerNames.length - 3}</span>}
                    </div>
                  )}
                  {taskCount > 0 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {taskDone}/{taskCount} משימות
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { PriorityChip, DueChip };
