import * as XLSX from 'xlsx';
import { formatDate } from '../api';

const STATUS_LABELS = { active: 'פעיל', forming: 'בהתהוות', inactive: 'לא פעיל', archived: 'ארכיון' };

export function downloadProjectsXlsx({ projects, partners }) {
  const partnerMap = Object.fromEntries((partners || []).map((p) => [p.id, p.organizationName]));
  const rows = (projects || []).map((p) => {
    const tasks = p.tasks || [];
    const tasksDone = tasks.filter((t) => (t.status || (t.completed ? 'done' : 'todo')) === 'done').length;
    const lastActivity = (p.change_history || []).slice(-1)[0]?.at || p.updated_at;
    return {
      'כותרת': p.title || '',
      'סטטוס': STATUS_LABELS[p.status] || p.status || '',
      'שלב': p.stage || '',
      'עדיפות': p.priority || '',
      'אחראי': p.owner || '',
      'מטרה': p.goal || '',
      'תחילת פעילות': p.start_date ? formatDate(p.start_date) : '',
      'מועד יעד': p.due_date ? formatDate(p.due_date) : '',
      'מחלקה מובילה': p.leading_department || '',
      'שנת פעילות': p.activity_year || '',
      'קישור Drive': p.drive_link || '',
      'מספר שותפים': (p.partners || []).length,
      'שותפים': (p.partners || []).map((lp) => partnerMap[lp.partner_id]).filter(Boolean).join(', '),
      'משימות סך-הכל': tasks.length,
      'משימות שהושלמו': tasksDone,
      'תגובות': (p.comments || []).length,
      'מדדים': (p.metrics || []).length,
      'פעילות אחרונה': lastActivity ? formatDate(lastActivity) : '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'פרויקטים');
  XLSX.writeFile(wb, 'פרויקטים.xlsx');
}
