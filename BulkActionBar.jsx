import { useState } from 'react';
import { X, Tag, Archive, Trash2, Check } from 'lucide-react';
import { useCan } from './UserContext.jsx';
import { apiJson } from './api';
import { showToast } from './Toast';

export default function BulkActionBar({ kind, selectedIds, onClear, onComplete, stageOptions = [] }) {
  const canWrite = useCan('write');
  const canDelete = useCan('delete');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(null);
  const [tagText, setTagText] = useState('');

  if (selectedIds.length === 0) return null;

  const run = async (action, payload) => {
    if (busy) return;
    setBusy(true);
    try {
      const url = kind === 'partner' ? '/partners/bulk' : '/projects/bulk';
      const result = await apiJson(url, {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, action, payload }),
      });
      showToast(`עודכנו ${result.ok.length} פריטים${result.failed.length ? ` (${result.failed.length} כשלים)` : ''}`, 'success');
      setPickerOpen(null);
      setTagText('');
      onComplete();
    } catch {
      showToast('הפעולה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-count">
        <Check size={16} /> נבחרו {selectedIds.length}
      </div>

      {kind === 'partner' && canWrite && (
        <>
          <div className="bulk-action-group">
            <button className="btn btn-outline btn-sm" onClick={() => setPickerOpen(pickerOpen === 'status' ? null : 'status')}>
              <Archive size={14} /> שנה סטטוס
            </button>
            {pickerOpen === 'status' && (
              <div className="bulk-picker">
                {['active', 'forming', 'inactive', 'archived'].map((s) => (
                  <button key={s} className="bulk-picker-item" onClick={() => run('set_status', { status: s })} disabled={busy}>
                    {s === 'active' ? 'פעיל' : s === 'forming' ? 'בהתהוות' : s === 'inactive' ? 'לא פעיל' : 'ארכיון'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bulk-action-group">
            <button className="btn btn-outline btn-sm" onClick={() => setPickerOpen(pickerOpen === 'tag' ? null : 'tag')}>
              <Tag size={14} /> הוסף תגית
            </button>
            {pickerOpen === 'tag' && (
              <div className="bulk-picker" style={{ minWidth: '200px' }}>
                <input
                  className="form-control"
                  placeholder="שם תגית"
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!tagText.trim() || busy}
                  onClick={() => run('add_tag', { tag: { id: `tag_${Date.now()}`, label: tagText.trim(), color: '#22C55E' } })}
                >
                  הוסף
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {kind === 'project' && canWrite && stageOptions.length > 0 && (
        <div className="bulk-action-group">
          <button className="btn btn-outline btn-sm" onClick={() => setPickerOpen(pickerOpen === 'stage' ? null : 'stage')}>
            <Archive size={14} /> שנה שלב
          </button>
          {pickerOpen === 'stage' && (
            <div className="bulk-picker">
              {stageOptions.map((s) => (
                <button key={s.id} className="bulk-picker-item" onClick={() => run('set_stage', { stage: s.label })} disabled={busy}>
                  <span style={{ width: 10, height: 10, background: s.color, borderRadius: 3, display: 'inline-block', marginInlineEnd: 6 }} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canDelete && (
        <button
          className="btn btn-danger btn-sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`למחוק ${selectedIds.length} פריטים?`)) run('delete', {});
          }}
        >
          <Trash2 size={14} /> מחק
        </button>
      )}

      <button className="btn btn-outline btn-sm" onClick={onClear}>
        <X size={14} /> בטל בחירה
      </button>
    </div>
  );
}
