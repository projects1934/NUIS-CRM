import { useState } from 'react';
import { Plus, Trash2, CheckSquare } from 'lucide-react';
import { apiJson, formatDate } from '../api';
import { showToast } from './Toast';

const STATUS_CYCLE = ['todo', 'in_progress', 'done', 'blocked'];
const STATUS_LABEL = {
  todo: 'לביצוע',
  in_progress: 'בעבודה',
  done: 'הושלם',
  blocked: 'תקוע',
};
const statusOf = (task) => task.status || (task.completed ? 'done' : 'todo');

export default function ProjectTasks({ projectId, tasks, onChange }) {
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const list = Array.isArray(tasks) ? tasks : [];
  const doneCount = list.filter((t) => statusOf(t) === 'done').length;
  const pct = list.length ? Math.round((doneCount / list.length) * 100) : 0;

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const updated = await apiJson(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      onChange(updated);
      setNewTitle('');
    } catch {
      showToast('הוספת המשימה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cycleStatus = async (task) => {
    const current = statusOf(task);
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    try {
      const updated = await apiJson(`/projects/${projectId}/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      });
      onChange(updated);
    } catch {
      showToast('עדכון המשימה נכשל', 'error');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      const updated = await apiJson(`/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' });
      onChange(updated);
    } catch {
      showToast('המחיקה נכשלה', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckSquare size={18} color="var(--primary-color)" />
          משימות
          {list.length > 0 && <span className="drawer-count">{doneCount}/{list.length}</span>}
        </h3>
      </div>

      {list.length > 0 && (
        <div className="task-progress">
          <div className="task-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); addTask(); }} style={{ display: 'flex', gap: '8px', marginBottom: '12px', marginTop: list.length > 0 ? '12px' : 0 }}>
        <input
          className="form-control"
          placeholder="+ הוסף משימה..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!newTitle.trim() || busy}>
          <Plus size={16} />
        </button>
      </form>

      {list.length === 0 ? (
        <div className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>אין משימות עדיין</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {list.map((task) => {
            const status = statusOf(task);
            return (
              <div key={task.id} className={`task-row ${status === 'done' ? 'task-row-done' : ''}`}>
                <button
                  type="button"
                  className={`task-status-chip task-status-${status}`}
                  onClick={() => cycleStatus(task)}
                  title="לחץ למחזור סטטוס"
                >
                  {STATUS_LABEL[status]}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={status === 'done' ? 'task-title-done' : ''}>{task.title}</div>
                  {(task.assignee || task.due_date) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {task.assignee && <span>{task.assignee}</span>}
                      {task.assignee && task.due_date && <span> · </span>}
                      {task.due_date && <span>{formatDate(task.due_date)}</span>}
                    </div>
                  )}
                </div>
                <button type="button" className="btn-icon task-delete" onClick={() => deleteTask(task.id)} title="מחק משימה">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
