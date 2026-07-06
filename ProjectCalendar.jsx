/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, List, ChevronRight, ChevronLeft } from 'lucide-react';
import { apiJson } from './api';

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const DOW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

export default function ProjectCalendar() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [stageOptions, setStageOptions] = useState([]);
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());

  useEffect(() => {
    apiJson('/projects').then((data) => setProjects(Array.isArray(data) ? data : [])).catch(() => setProjects([]));
    apiJson('/options/project_stage').then((data) => setStageOptions(Array.isArray(data) ? data : [])).catch(() => setStageOptions([]));
  }, []);

  const stageColor = (stage) => stageOptions.find((s) => s.label === stage)?.color || '#0071E3';

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor]);

  // Build month grid
  const grid = useMemo(() => {
    const cells = [];
    const firstDow = monthStart.getDay();
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      const iso = d.toISOString().split('T')[0];
      const projectsOnDay = projects.filter((p) => p.due_date && String(p.due_date).startsWith(iso));
      cells.push({ day, iso, projects: projectsOnDay });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [projects, monthStart, monthEnd, cursor]);

  // Build timeline data
  const timelineProjects = useMemo(() => {
    return projects
      .filter((p) => p.start_date || p.due_date)
      .filter((p) => {
        const start = p.start_date ? new Date(p.start_date) : new Date(p.due_date);
        const end = p.due_date ? new Date(p.due_date) : new Date(p.start_date);
        return !(end < monthStart || start > monthEnd);
      })
      .map((p) => {
        const start = p.start_date ? new Date(p.start_date) : new Date(p.due_date);
        const end = p.due_date ? new Date(p.due_date) : new Date(p.start_date);
        const monthDays = monthEnd.getDate();
        const clampStart = Math.max(1, start.getMonth() === cursor.getMonth() && start.getFullYear() === cursor.getFullYear() ? start.getDate() : 1);
        const clampEnd = Math.min(monthDays, end.getMonth() === cursor.getMonth() && end.getFullYear() === cursor.getFullYear() ? end.getDate() : monthDays);
        return { project: p, startDay: clampStart, endDay: clampEnd };
      });
  }, [projects, monthStart, monthEnd, cursor]);

  return (
    <div>
      <div className="page-header">
        <h2><Calendar size={22} /> לוח שנה - פרויקטים</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className={`btn ${view === 'month' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setView('month')}>
            <Calendar size={14} /> חודש
          </button>
          <button className={`btn ${view === 'timeline' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setView('timeline')}>
            <List size={14} /> ציר זמן
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronRight size={16} />
          </button>
          <h3 style={{ margin: 0 }}>{HEBREW_MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h3>
          <button className="btn btn-outline btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronLeft size={16} />
          </button>
        </div>

        {view === 'month' ? (
          <div className="cal-grid">
            {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {grid.map((cell, i) => (
              <div key={i} className={`cal-cell ${!cell ? 'cal-cell-empty' : ''}`}>
                {cell && (
                  <>
                    <div className="cal-day">{cell.day}</div>
                    <div className="cal-events">
                      {cell.projects.slice(0, 3).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="cal-event"
                          style={{ '--cal-event-color': stageColor(p.stage) }}
                          onClick={() => navigate(`/projects/${p.id}`)}
                          title={p.title}
                        >
                          {p.title}
                        </button>
                      ))}
                      {cell.projects.length > 3 && (
                        <span className="cal-event-more">+{cell.projects.length - 3}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>
            {timelineProjects.length === 0 ? (
              <div className="muted-text" style={{ padding: '20px', textAlign: 'center' }}>אין פרויקטים פעילים בחודש הזה</div>
            ) : (
              <div>
                <div className="timeline-header">
                  {Array.from({ length: monthEnd.getDate() }, (_, i) => (
                    <div key={i} className="timeline-day-marker">{i + 1}</div>
                  ))}
                </div>
                {timelineProjects.map(({ project, startDay, endDay }) => {
                  const total = monthEnd.getDate();
                  const left = ((startDay - 1) / total) * 100;
                  const width = ((endDay - startDay + 1) / total) * 100;
                  return (
                    <div key={project.id} className="timeline-row" onClick={() => navigate(`/projects/${project.id}`)}>
                      <div className="timeline-row-label">{project.title}</div>
                      <div className="timeline-row-track">
                        <div
                          className="timeline-row-bar"
                          style={{ insetInlineStart: `${left}%`, width: `${width}%`, background: stageColor(project.stage) }}
                          title={`${project.start_date || '-'} → ${project.due_date || '-'}`}
                        >
                          <span>{project.stage || 'ללא שלב'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
