import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';

const COLORS = {
  active:   '#22C55E',
  forming:  '#FBBF24',
  inactive: '#EF4444',
  archived: '#CBD5E1',
  primary:  '#5BA4CF',
  teal:     '#14B8A6',
  violet:   '#A78BFA',
  amber:    '#FBBF24',
};
const STATUS_HE = { active: 'פעיל', forming: 'בהתהוות', inactive: 'לא פעיל', archived: 'ארכיון' };

const tooltipStyle = {
  background: 'var(--surface-color)',
  border: 'none',
  borderRadius: '12px',
  fontFamily: 'inherit',
  direction: 'rtl',
  fontSize: '0.82rem',
  boxShadow: 'var(--shadow-md)',
  padding: '8px 12px',
};

// Recharts ticks render as SVG <text> which inherits the body's direction: rtl
// and ends up reversing Hebrew character order. Wrap the chart in a LTR
// container and use a custom tick that renders text in LTR — Hebrew glyphs
// still display right-to-left naturally inside an LTR run.
function HebrewTick({ x, y, payload, anchor = 'middle', dy = 14 }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={dy} textAnchor={anchor} fill="var(--text-secondary)" fontSize={11} dir="rtl">
        {payload.value}
      </text>
    </g>
  );
}

const ChartWrap = ({ children, height = 220 }) => (
  <div style={{ direction: 'ltr', width: '100%', height }}>{children}</div>
);

export function PartnerStatusDonut({ partners }) {
  const counts = {};
  for (const p of partners || []) counts[p.status || 'active'] = (counts[p.status || 'active'] || 0) + 1;
  const data = Object.entries(counts).map(([k, v]) => ({ name: STATUS_HE[k] || k, value: v, key: k }));
  if (data.length === 0) return <EmptyChart label="אין נתונים" />;
  return (
    <ChartWrap>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={2} stroke="none">
            {data.map((d) => <Cell key={d.key} fill={COLORS[d.key] || '#94A3B8'} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ direction: 'rtl', fontSize: '0.82rem' }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}

export function ProjectsByStageBar({ projects, stageOptions }) {
  const counts = {};
  for (const p of projects || []) counts[p.stage || 'ללא שלב'] = (counts[p.stage || 'ללא שלב'] || 0) + 1;
  const data = Object.entries(counts).map(([name, value]) => {
    const opt = (stageOptions || []).find((o) => o.label === name);
    return { name, value, fill: opt?.color || COLORS.primary };
  });
  if (data.length === 0) return <EmptyChart label="אין פרויקטים" />;
  return (
    <ChartWrap>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
          <XAxis type="number" stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            stroke="var(--text-secondary)"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={(props) => <HebrewTick {...props} anchor="end" dy={4} />}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-muted)' }} />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={18}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}

export function TaskCompletionLine({ projects }) {
  // Derive cumulative completed-task count by day over last 30 days.
  const days = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d, label: `${d.getDate()}/${d.getMonth() + 1}`, count: 0 });
  }
  for (const p of projects || []) {
    for (const t of (p.tasks || [])) {
      if ((t.status === 'done' || t.completed) && t.created_at) {
        const td = new Date(t.created_at);
        td.setHours(0, 0, 0, 0);
        const bucket = buckets.find((b) => b.date.getTime() === td.getTime());
        if (bucket) bucket.count += 1;
      }
    }
  }
  // cumulative
  let acc = 0;
  const data = buckets.map((b) => { acc += b.count; return { name: b.label, value: acc }; });
  if (acc === 0) return <EmptyChart label="אין משימות שהושלמו ב-30 הימים האחרונים" />;
  return (
    <ChartWrap>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} />
          <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="value" stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 3.5, fill: COLORS.primary, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}

export function ImpactByTypeBar({ projects }) {
  const TYPE_LABELS = { input: 'תשומות', activity: 'פעילויות', output: 'תפוקות', outcome: 'תוצאות', long_term: 'אימפקט' };
  const TYPE_COLORS = { input: '#94A3B8', activity: '#FBBF24', output: '#5BA4CF', outcome: '#22C55E', long_term: '#A78BFA' };
  const buckets = {};
  for (const p of projects || []) {
    for (const m of (p.metrics || [])) {
      const t = m.type;
      const current = (m.data_points || []).length ? m.data_points[m.data_points.length - 1].value : (m.baseline ?? 0);
      const baseline = m.baseline ?? 0;
      if (m.target == null) continue;
      const span = m.target - baseline;
      if (span === 0) continue;
      const pct = Math.max(0, Math.min(100, ((current - baseline) / span) * 100));
      if (!buckets[t]) buckets[t] = { sum: 0, count: 0 };
      buckets[t].sum += pct;
      buckets[t].count += 1;
    }
  }
  const data = Object.entries(TYPE_LABELS).map(([k, name]) => ({
    name,
    value: buckets[k] ? Math.round(buckets[k].sum / buckets[k].count) : 0,
    fill: TYPE_COLORS[k],
  }));
  if (data.every((d) => d.value === 0)) return <EmptyChart label="אין מדדי אימפקט מוגדרים" />;
  return (
    <ChartWrap>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="var(--text-secondary)"
            tickLine={false}
            axisLine={false}
            tick={(props) => <HebrewTick {...props} anchor="middle" dy={14} />}
          />
          <YAxis stroke="var(--text-secondary)" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} cursor={{ fill: 'var(--surface-muted)' }} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={28}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}

function EmptyChart({ label }) {
  return (
    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem', textAlign: 'center', padding: '0 16px' }}>
      {label}
    </div>
  );
}
