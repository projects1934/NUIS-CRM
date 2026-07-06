const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch { /* postgres-only deploy */ }

const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 8;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const DEFAULT_PIN = process.env.DEFAULT_ADMIN_PIN || null;
const DEFAULT_USER = process.env.DEFAULT_ADMIN_USER || null;
const MIN_DEFAULT_PIN_LENGTH = 6;

const privateDir = path.join(__dirname, 'private');
const backupsDir = path.join(privateDir, 'backups');
const dbPath = path.join(privateDir, 'partners.sqlite');
const legacyDataPath = path.join(__dirname, 'data.json');
const legacySettingsPath = path.join(__dirname, 'settings.json');
const privateSettingsPath = path.join(privateDir, 'settings.json');

const usePostgres = Boolean(process.env.DATABASE_URL);
let pgPool = null;
let sqliteDb = null;
let initialized = false;

const ensurePrivateStorage = () => fs.mkdirSync(backupsDir, { recursive: true });
const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const backupFile = (filePath, label) => {
  if (!fs.existsSync(filePath)) return null;
  ensurePrivateStorage();
  const target = path.join(backupsDir, `${label}-${timestamp()}${path.extname(filePath) || '.json'}`);
  fs.copyFileSync(filePath, target);
  return target;
};

const legacyHashPin = (pin, salt) => ({
  salt,
  hash: crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex'),
});

const hashPinBcrypt = async (pin) => {
  const hash = await bcrypt.hash(String(pin), BCRYPT_ROUNDS);
  return { algorithm: 'bcrypt', salt: '', hash };
};

const verifyLegacyPin = (pin, salt, hash) => {
  if (!salt || !hash) return false;
  return legacyHashPin(pin, salt).hash === hash;
};

const verifyBcryptPin = async (pin, hash) => {
  if (!hash) return false;
  try {
    return await bcrypt.compare(String(pin), hash);
  } catch {
    return false;
  }
};

const detectAlgorithm = (user) => {
  const explicit = user.pin_algorithm || user.pinAlgorithm;
  if (explicit) return String(explicit).toLowerCase();
  const hash = user.pin_hash || user.pinHash || '';
  if (typeof hash === 'string' && /^\$2[aby]\$/.test(hash)) return 'bcrypt';
  return 'sha256';
};
const newId = () => crypto.randomUUID();
const sessionExpiry = () => new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();

const normalizeContact = (contact) => ({
  id: contact.id || newId(),
  name: contact.name || '',
  role: contact.role || '',
  phone: contact.phone || '',
  email: contact.email || '',
  dataSource: contact.dataSource || '',
  isPrimary: Boolean(contact.isPrimary),
});

const normalizeLogEntry = (entry) => ({
  id: entry.id || newId(),
  date: entry.date || new Date().toISOString(),
  updaterName: entry.updaterName || '',
  type: entry.type || 'note',
  message: entry.message || '',
});

const computeLastContactAt = (logs, fallback) => {
  if (!Array.isArray(logs) || logs.length === 0) return fallback || '';
  let max = 0;
  for (const l of logs) {
    const t = new Date(l.date).getTime();
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max ? new Date(max).toISOString() : (fallback || '');
};

const ensurePrimaryContact = (contacts) => {
  if (!Array.isArray(contacts) || contacts.length === 0) return contacts;
  if (contacts.some((c) => c.isPrimary)) return contacts;
  return contacts.map((c, i) => (i === 0 ? { ...c, isPrimary: true } : c));
};

const normalizePartner = (partner, rowOrder = 0) => {
  const contacts = ensurePrimaryContact(
    Array.isArray(partner.contacts) ? partner.contacts.map(normalizeContact) : []
  );
  const communicationLog = Array.isArray(partner.communicationLog)
    ? partner.communicationLog.map(normalizeLogEntry)
    : [];
  const createdAt = partner.createdAt || new Date().toISOString();
  return {
    id: partner.id || newId(),
    organizationName: partner.organizationName || '',
    domain: partner.domain || '',
    status: partner.status || 'active',
    priority: partner.priority || '',
    sponsorshipCategory: partner.sponsorshipCategory || '',
    estimatedAmount: partner.estimatedAmount ?? '',
    packageDescription: partner.packageDescription || '',
    pic: partner.pic || '',
    contacts,
    communicationLog,
    generalNotes: partner.generalNotes || '',
    lastUpdated: partner.lastUpdated || new Date().toISOString(),
    lastModifiedAt: partner.lastModifiedAt || partner.lastUpdated || new Date().toISOString(),
    lastModifiedBy: partner.lastModifiedBy || partner.lastUpdatedBy || '',
    changeHistory: Array.isArray(partner.changeHistory) ? partner.changeHistory.slice(-10) : [],
    createdAt,
    sourceFiles: Array.isArray(partner.sourceFiles) ? partner.sourceFiles : [],
    contactDate: partner.contactDate || new Date().toISOString().split('T')[0],
    partnerType: partner.partnerType || '',
    partnerCategory: partner.partnerCategory || '',
    tags: Array.isArray(partner.tags) ? partner.tags : [],
    parentPartnerId: partner.parentPartnerId || null,
    lastUpdatedBy: partner.lastUpdatedBy || partner.lastModifiedBy || '',
    region: partner.region || '',
    collaborationStartDate: partner.collaborationStartDate || '',
    lastContactAt: computeLastContactAt(communicationLog, createdAt),
    rowOrder,
  };
};

const sqlite = () => {
  if (sqliteDb) return sqliteDb;
  ensurePrivateStorage();
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS partners_json (
      id TEXT PRIMARY KEY,
      organizationName TEXT NOT NULL,
      data TEXT NOT NULL,
      rowOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      pinSalt TEXT NOT NULL,
      pinHash TEXT NOT NULL,
      pinAlgorithm TEXT NOT NULL DEFAULT 'sha256',
      active INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      ip TEXT,
      success INTEGER NOT NULL,
      attemptedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
      ON login_attempts(ip, username, attemptedAt DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      username TEXT PRIMARY KEY,
      settings TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      partnerId TEXT,
      senderUsername TEXT NOT NULL,
      recipientUsername TEXT,
      messageType TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL,
      mentions TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message_reads (
      messageId TEXT NOT NULL,
      username TEXT NOT NULL,
      readAt TEXT NOT NULL,
      PRIMARY KEY (messageId, username)
    );
    CREATE TABLE IF NOT EXISTS message_reactions (
      messageId TEXT NOT NULL,
      username TEXT NOT NULL,
      emoji TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (messageId, username, emoji)
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#1a56db',
      created_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS app_options (
      id TEXT PRIMARY KEY,
      option_type TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#1a56db',
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      description TEXT,
      leading_department TEXT,
      field_labels TEXT DEFAULT '{}',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS project_partners (
      project_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      contact_id TEXT,
      PRIMARY KEY (project_id, partner_id)
    );
  `);

  const userColumns = sqliteDb.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
  if (!userColumns.includes('pinAlgorithm')) {
    sqliteDb.exec("ALTER TABLE users ADD COLUMN pinAlgorithm TEXT NOT NULL DEFAULT 'sha256'");
  }

  const projectColumns = sqliteDb.prepare('PRAGMA table_info(projects)').all().map((row) => row.name);
  if (!projectColumns.includes('activity_year')) {
    sqliteDb.exec('ALTER TABLE projects ADD COLUMN activity_year TEXT');
  }
  if (!projectColumns.includes('drive_link')) {
    sqliteDb.exec('ALTER TABLE projects ADD COLUMN drive_link TEXT');
  }
  if (!projectColumns.includes('attachments')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN attachments TEXT DEFAULT '[]'");
  }
  if (!projectColumns.includes('stage')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN stage TEXT DEFAULT ''");
  }
  if (!projectColumns.includes('priority')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN priority TEXT DEFAULT ''");
  }
  if (!projectColumns.includes('owner')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN owner TEXT DEFAULT ''");
  }
  if (!projectColumns.includes('due_date')) {
    sqliteDb.exec('ALTER TABLE projects ADD COLUMN due_date TEXT');
  }
  if (!projectColumns.includes('start_date')) {
    sqliteDb.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
  }
  if (!projectColumns.includes('tasks')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN tasks TEXT DEFAULT '[]'");
  }
  if (!projectColumns.includes('comments')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN comments TEXT DEFAULT '[]'");
  }
  if (!projectColumns.includes('change_history')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN change_history TEXT DEFAULT '[]'");
  }
  if (!projectColumns.includes('labels')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN labels TEXT DEFAULT '[]'");
  }
  if (!projectColumns.includes('goal')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN goal TEXT DEFAULT ''");
  }
  if (!projectColumns.includes('metrics')) {
    sqliteDb.exec("ALTER TABLE projects ADD COLUMN metrics TEXT DEFAULT '[]'");
  }
  if (!projectColumns.includes('is_template')) {
    sqliteDb.exec('ALTER TABLE projects ADD COLUMN is_template INTEGER DEFAULT 0');
  }

  // RBAC: role column on users
  const userColumnsAfter = sqliteDb.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
  if (!userColumnsAfter.includes('role')) {
    sqliteDb.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'");
    // backfill: oldest user → admin, the rest → manager
    const existing = sqliteDb.prepare('SELECT username, createdAt FROM users ORDER BY createdAt ASC').all();
    if (existing.length > 0) {
      sqliteDb.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(existing[0].username);
      if (existing.length > 1) {
        const stmt = sqliteDb.prepare("UPDATE users SET role = 'manager' WHERE username = ?");
        for (let i = 1; i < existing.length; i++) stmt.run(existing[i].username);
      }
    }
  }

  // Notifications table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT DEFAULT '',
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient, created_at DESC);
    CREATE TABLE IF NOT EXISTS representations (
      id TEXT PRIMARY KEY,
      organization TEXT NOT NULL DEFAULT '',
      seat_description TEXT NOT NULL DEFAULT '',
      representative_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'filled',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS finance_entries (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      project_id TEXT,
      direction TEXT NOT NULL DEFAULT 'incoming',
      kind TEXT NOT NULL DEFAULT 'actual',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'ILS',
      occurred_on TEXT NOT NULL DEFAULT '',
      due_on TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'paid',
      category TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_partner ON finance_entries(partner_id, occurred_on DESC);
    CREATE INDEX IF NOT EXISTS idx_finance_status  ON finance_entries(status, due_on);
  `);

  const messageColumns = sqliteDb.prepare('PRAGMA table_info(messages)').all().map((row) => row.name);
  if (!messageColumns.includes('recipientUsername')) {
    sqliteDb.exec('ALTER TABLE messages ADD COLUMN recipientUsername TEXT');
  }
  if (!messageColumns.includes('messageType')) {
    sqliteDb.exec("ALTER TABLE messages ADD COLUMN messageType TEXT NOT NULL DEFAULT 'text'");
  }
  if (!messageColumns.includes('metadata')) {
    sqliteDb.exec('ALTER TABLE messages ADD COLUMN metadata TEXT');
  }
  if (!messageColumns.includes('replyToMessageId')) {
    sqliteDb.exec('ALTER TABLE messages ADD COLUMN replyToMessageId TEXT');
  }

  return sqliteDb;
};

const pg = () => {
  if (pgPool) return pgPool;
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  return pgPool;
};

const ensureSchema = async () => {
  if (initialized) return;

  if (usePostgres) {
    await pg().query(`
      CREATE TABLE IF NOT EXISTS partners (
        id TEXT PRIMARY KEY,
        organization_name TEXT NOT NULL,
        data JSONB NOT NULL,
        row_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_partners_row_order ON partners(row_order);
      CREATE INDEX IF NOT EXISTS idx_partners_name ON partners(organization_name);

      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        pin_salt TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_algorithm TEXT NOT NULL DEFAULT 'sha256';

      CREATE TABLE IF NOT EXISTS login_attempts (
        id BIGSERIAL PRIMARY KEY,
        username TEXT,
        ip TEXT,
        success BOOLEAN NOT NULL,
        attempted_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
        ON login_attempts(ip, username, attempted_at DESC);

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
        settings JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        partner_id TEXT,
        sender_username TEXT NOT NULL REFERENCES users(username),
        body TEXT NOT NULL,
        mentions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_username TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_username);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_username);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id);

      CREATE TABLE IF NOT EXISTS message_reads (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        read_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, username)
      );

      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, username, emoji)
      );
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#1a56db',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_options (
        id TEXT PRIMARY KEY,
        option_type TEXT NOT NULL,
        label TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#1a56db',
        is_default BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        description TEXT,
        leading_department TEXT,
        activity_year TEXT,
        drive_link TEXT,
        attachments JSONB DEFAULT '[]',
        field_labels JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS activity_year TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS drive_link TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT '';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT '';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT '';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_date DATE;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS change_history JSONB DEFAULT '[]';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS goal TEXT DEFAULT '';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '[]';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer';

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        type TEXT NOT NULL,
        body TEXT NOT NULL,
        link TEXT DEFAULT '',
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient, created_at DESC);

      CREATE TABLE IF NOT EXISTS representations (
        id TEXT PRIMARY KEY,
        organization TEXT NOT NULL DEFAULT '',
        seat_description TEXT NOT NULL DEFAULT '',
        representative_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'filled',
        notes TEXT NOT NULL DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_partners (
        project_id TEXT NOT NULL,
        partner_id TEXT NOT NULL,
        contact_id TEXT,
        PRIMARY KEY (project_id, partner_id)
      );

      CREATE TABLE IF NOT EXISTS finance_entries (
        id TEXT PRIMARY KEY,
        partner_id TEXT NOT NULL,
        project_id TEXT,
        direction TEXT NOT NULL DEFAULT 'incoming',
        kind TEXT NOT NULL DEFAULT 'actual',
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'ILS',
        occurred_on DATE,
        due_on DATE,
        status TEXT NOT NULL DEFAULT 'paid',
        category TEXT NOT NULL DEFAULT '',
        reference TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_finance_partner ON finance_entries(partner_id, occurred_on DESC);
      CREATE INDEX IF NOT EXISTS idx_finance_status  ON finance_entries(status, due_on);
    `);

    // backfill: oldest user → admin, rest → manager (only when no admin yet)
    const adminCount = (await pg().query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")).rows[0].c;
    if (Number(adminCount) === 0) {
      const allUsers = (await pg().query('SELECT username FROM users ORDER BY created_at ASC')).rows;
      if (allUsers.length > 0) {
        await pg().query("UPDATE users SET role = 'admin' WHERE username = $1", [allUsers[0].username]);
        for (let i = 1; i < allUsers.length; i++) {
          await pg().query("UPDATE users SET role = 'manager' WHERE username = $1", [allUsers[i].username]);
        }
      }
    }

    await migrateOldStatuses();
  } else {
    sqlite();
    migrateLegacyFiles();
    migrateOldStatusesSqlite();
  }

  await ensureDefaultUser();
  await ensureDefaultProjectStages();
  await ensureDefaultRepresentations();
  initialized = true;
};

// Seed the representations table once with the union's known seats
// (from דניאל's WhatsApp screenshot — "המושבים שלנו"). Runs only when
// the table is empty so it never duplicates user data.
const ensureDefaultRepresentations = async () => {
  try {
    const existing = await listRepresentations();
    if (existing.length > 0) return;
    const seed = [
      { organization: 'הועדה הארצית לתכנון ובניה',                                seatDescription: 'חברות בועדה — חסר, בעבר תום היה כרגע מאויש על ידי ממלא מקום לא מצוות העמותה', status: 'missing', representativeName: '' },
      { organization: 'הועדה המחוזית של ית"ד מטעם משרד הרווחה',                  seatDescription: 'חברות בועדה',                                                                          status: 'filled',  representativeName: 'מיכל' },
      { organization: 'מועצת ההנדסאים',                                            seatDescription: 'חברות במועצה',                                                                         status: 'filled',  representativeName: 'ליאב' },
      { organization: 'מל"ן — פורום נגישות בהשכלה גבוהה',                         seatDescription: 'חברות בפורום',                                                                         status: 'filled',  representativeName: 'מיכל' },
      { organization: 'נט"ר',                                                       seatDescription: 'אסיפה כללית',                                                                          status: 'missing', representativeName: '' },
      { organization: 'פר"ח',                                                       seatDescription: 'אסיפה כללית',                                                                          status: 'missing', representativeName: '' },
      { organization: 'פר"ח',                                                       seatDescription: 'חברות בועד קרן הסיוע — מלגות',                                                       status: 'missing', representativeName: '' },
      { organization: 'תוצרת הארץ',                                                 seatDescription: '2 חברויות בועד המנהל',                                                                 status: 'partial', representativeName: 'נלעד + חסר' },
      { organization: 'ESU — איחוד הסטודנטים האירופי',                             seatDescription: 'מושב קבוע',                                                                            status: 'filled',  representativeName: 'אמיליה' },
      { organization: 'WUJS — התאחדות הסטודנטים היהודית העולמית',                   seatDescription: 'מושב קבוע בדירקטוריון והנהלת הדירקטוריון',                                          status: 'filled',  representativeName: 'שילת' },
    ];
    for (let i = 0; i < seed.length; i++) {
      await createRepresentation({ ...seed[i], sortOrder: i });
    }
    console.log(`[seed] inserted ${seed.length} default representations`);
  } catch (err) {
    console.warn('[seed] representations seed failed:', err.message);
  }
};

const ensureDefaultProjectStages = async () => {
  try {
    const existing = await listOptions('project_stage');
    if (existing && existing.length > 0) return;
    const defaults = [
      { label: 'בתכנון', color: '#6b7280' },
      { label: 'בעבודה', color: '#1a73e8' },
      { label: 'לקראת סיום', color: '#b45309' },
      { label: 'הושלם', color: '#057a55' },
    ];
    let idx = 0;
    for (const d of defaults) {
      await createOption(newId(), 'project_stage', d.label, d.color, false, idx++);
    }
  } catch (err) {
    console.warn('[seed] project_stage default seeding skipped:', err.message);
  }
};

const OLD_TO_NEW_STATUS = { initial: 'active', negotiation: 'active', closed: 'active', archive: 'archived' };

const migrateOldStatuses = async () => {
  if (!usePostgres) return;
  try {
    const rows = (await pg().query('SELECT id, data FROM partners')).rows;
    for (const row of rows) {
      const data = row.data;
      const mapped = OLD_TO_NEW_STATUS[data.status];
      if (mapped) {
        data.status = mapped;
        await pg().query('UPDATE partners SET data = $1 WHERE id = $2', [data, row.id]);
      }
    }
  } catch (err) {
    console.warn('[migration] Status migration failed:', err.message);
  }
};

const migrateOldStatusesSqlite = () => {
  if (usePostgres) return;
  try {
    const db = sqlite();
    const rows = db.prepare('SELECT id, data FROM partners_json').all();
    for (const row of rows) {
      const data = JSON.parse(row.data);
      const mapped = OLD_TO_NEW_STATUS[data.status];
      if (mapped) {
        data.status = mapped;
        db.prepare('UPDATE partners_json SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
      }
    }
  } catch (err) {
    console.warn('[migration] SQLite status migration failed:', err.message);
  }
};

const ensureDefaultUser = async () => {
  const users = await listUsers(false);
  if (users.length > 0) return;
  if (!DEFAULT_USER || !DEFAULT_PIN) {
    console.warn('[security] No users exist and DEFAULT_ADMIN_USER/DEFAULT_ADMIN_PIN are not set; skipping default user bootstrap. Register a user via /api/auth/register.');
    return;
  }
  if (String(DEFAULT_PIN).length < MIN_DEFAULT_PIN_LENGTH) {
    console.warn(`[security] DEFAULT_ADMIN_PIN is shorter than ${MIN_DEFAULT_PIN_LENGTH} characters; refusing to bootstrap a default admin. Set a stronger PIN and restart.`);
    return;
  }
  await createUser(DEFAULT_USER, DEFAULT_PIN, DEFAULT_USER);
  console.warn('[security] Bootstrapped default admin user from environment. Rotate this PIN as soon as possible.');
};

const getStorageName = () => (usePostgres ? 'postgres' : 'sqlite-local');

const listUsers = async (activeOnly = true) => {
  if (usePostgres) {
    const result = await pg().query(
      `SELECT username, display_name AS "displayName", active, role FROM users ${activeOnly ? 'WHERE active = TRUE' : ''} ORDER BY display_name`
    );
    return result.rows;
  }
  const rows = sqlite().prepare(`SELECT username, displayName, active, role FROM users ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY displayName`).all();
  return rows.map((row) => ({ ...row, active: Boolean(row.active), role: row.role || 'viewer' }));
};

const getUserRole = async (username) => {
  if (!username) return null;
  if (usePostgres) {
    const row = (await pg().query('SELECT role FROM users WHERE username = $1', [username])).rows[0];
    return row ? row.role : null;
  }
  const row = sqlite().prepare('SELECT role FROM users WHERE username = ?').get(username);
  return row ? (row.role || 'viewer') : null;
};

const setUserRole = async (username, role) => {
  const allowed = ['admin', 'manager', 'viewer'];
  if (!allowed.includes(role)) throw new Error('invalid role');
  // last-admin guard
  if (role !== 'admin') {
    const current = await getUserRole(username);
    if (current === 'admin') {
      const adminCount = usePostgres
        ? Number((await pg().query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")).rows[0].c)
        : Number(sqlite().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c);
      if (adminCount <= 1) throw new Error('cannot demote last admin');
    }
  }
  if (usePostgres) {
    await pg().query('UPDATE users SET role = $1 WHERE username = $2', [role, username]);
  } else {
    sqlite().prepare('UPDATE users SET role = ? WHERE username = ?').run(role, username);
  }
};

// ── Notifications ─────────────────────────────────────────────────────────
const createNotification = async ({ recipient, type, body, link = '' }) => {
  if (!recipient) return null;
  const id = newId();
  const now = new Date().toISOString();
  if (usePostgres) {
    await pg().query(
      `INSERT INTO notifications (id, recipient, type, body, link, read, created_at) VALUES ($1,$2,$3,$4,$5,FALSE,NOW())`,
      [id, recipient, type, body, link]
    );
  } else {
    sqlite().prepare(
      `INSERT INTO notifications (id, recipient, type, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).run(id, recipient, type, body, link, now);
  }
  return { id, recipient, type, body, link, read: false, created_at: now };
};

const listNotificationsForUser = async (recipient, limit = 50) => {
  if (usePostgres) {
    const rows = (await pg().query(
      `SELECT id, recipient, type, body, link, read, created_at FROM notifications WHERE recipient = $1 ORDER BY created_at DESC LIMIT $2`,
      [recipient, limit]
    )).rows;
    return rows.map((r) => ({ ...r, read: Boolean(r.read) }));
  }
  const rows = sqlite().prepare(
    `SELECT id, recipient, type, body, link, read, created_at FROM notifications WHERE recipient = ? ORDER BY datetime(created_at) DESC LIMIT ?`
  ).all(recipient, limit);
  return rows.map((r) => ({ ...r, read: Boolean(r.read) }));
};

const markNotificationRead = async (id, recipient) => {
  if (usePostgres) {
    await pg().query('UPDATE notifications SET read = TRUE WHERE id = $1 AND recipient = $2', [id, recipient]);
  } else {
    sqlite().prepare('UPDATE notifications SET read = 1 WHERE id = ? AND recipient = ?').run(id, recipient);
  }
};

const markAllNotificationsRead = async (recipient) => {
  if (usePostgres) {
    await pg().query('UPDATE notifications SET read = TRUE WHERE recipient = $1', [recipient]);
  } else {
    sqlite().prepare('UPDATE notifications SET read = 1 WHERE recipient = ?').run(recipient);
  }
};

// ── Representations (נציגויות ההתאחדות) ───────────────────────────────────
const REPRESENTATION_STATUSES = ['filled', 'missing', 'partial'];

const normalizeRepresentation = (row) => ({
  id: row.id,
  organization: row.organization || '',
  seatDescription: row.seat_description || row.seatDescription || '',
  representativeName: row.representative_name || row.representativeName || '',
  status: REPRESENTATION_STATUSES.includes(row.status) ? row.status : 'filled',
  notes: row.notes || '',
  sortOrder: typeof (row.sort_order ?? row.sortOrder) === 'number' ? (row.sort_order ?? row.sortOrder) : 0,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || row.createdAt || ''),
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || row.updatedAt || ''),
});

const listRepresentations = async () => {
  if (usePostgres) {
    const rows = (await pg().query('SELECT * FROM representations ORDER BY sort_order ASC, created_at ASC')).rows;
    return rows.map(normalizeRepresentation);
  }
  const rows = sqlite().prepare('SELECT * FROM representations ORDER BY sort_order ASC, created_at ASC').all();
  return rows.map(normalizeRepresentation);
};

const createRepresentation = async (payload) => {
  const id = newId();
  const now = new Date().toISOString();
  const status = REPRESENTATION_STATUSES.includes(payload.status) ? payload.status : 'filled';
  const data = {
    organization: payload.organization || '',
    seatDescription: payload.seatDescription || '',
    representativeName: payload.representativeName || '',
    status,
    notes: payload.notes || '',
    sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
  };
  if (usePostgres) {
    const row = (await pg().query(
      `INSERT INTO representations (id, organization, seat_description, representative_name, status, notes, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING *`,
      [id, data.organization, data.seatDescription, data.representativeName, data.status, data.notes, data.sortOrder]
    )).rows[0];
    return normalizeRepresentation(row);
  }
  sqlite().prepare(
    `INSERT INTO representations (id, organization, seat_description, representative_name, status, notes, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.organization, data.seatDescription, data.representativeName, data.status, data.notes, data.sortOrder, now, now);
  return normalizeRepresentation({ id, ...data, created_at: now, updated_at: now });
};

const updateRepresentation = async (id, patch) => {
  const now = new Date().toISOString();
  const status = patch.status !== undefined ? (REPRESENTATION_STATUSES.includes(patch.status) ? patch.status : null) : undefined;
  if (usePostgres) {
    const row = (await pg().query(
      `UPDATE representations SET
         organization         = COALESCE($2, organization),
         seat_description     = COALESCE($3, seat_description),
         representative_name  = COALESCE($4, representative_name),
         status               = COALESCE($5, status),
         notes                = COALESCE($6, notes),
         sort_order           = COALESCE($7, sort_order),
         updated_at           = NOW()
       WHERE id = $1 RETURNING *`,
      [id,
        patch.organization,
        patch.seatDescription,
        patch.representativeName,
        status,
        patch.notes,
        typeof patch.sortOrder === 'number' ? patch.sortOrder : null]
    )).rows[0];
    return row ? normalizeRepresentation(row) : null;
  }
  const current = sqlite().prepare('SELECT * FROM representations WHERE id = ?').get(id);
  if (!current) return null;
  const merged = {
    organization:        patch.organization        !== undefined ? patch.organization        : current.organization,
    seat_description:    patch.seatDescription     !== undefined ? patch.seatDescription     : current.seat_description,
    representative_name: patch.representativeName  !== undefined ? patch.representativeName  : current.representative_name,
    status:              status !== undefined && status !== null ? status                    : current.status,
    notes:               patch.notes               !== undefined ? patch.notes               : current.notes,
    sort_order:          typeof patch.sortOrder === 'number'     ? patch.sortOrder           : current.sort_order,
  };
  sqlite().prepare(
    `UPDATE representations SET organization=?, seat_description=?, representative_name=?, status=?, notes=?, sort_order=?, updated_at=? WHERE id=?`
  ).run(merged.organization, merged.seat_description, merged.representative_name, merged.status, merged.notes, merged.sort_order, now, id);
  const row = sqlite().prepare('SELECT * FROM representations WHERE id = ?').get(id);
  return row ? normalizeRepresentation(row) : null;
};

const deleteRepresentation = async (id) => {
  if (usePostgres) await pg().query('DELETE FROM representations WHERE id = $1', [id]);
  else sqlite().prepare('DELETE FROM representations WHERE id = ?').run(id);
};

// ── Finance entries (תנועות כספיות) ──────────────────────────────────────
const FINANCE_DIRECTIONS = ['incoming', 'outgoing'];
const FINANCE_KINDS = ['actual', 'pledge'];
const FINANCE_STATUSES = ['paid', 'pending', 'overdue', 'cancelled'];

const toIsoDate = (v) => {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  const s = String(v);
  return s.length > 10 ? s.split('T')[0] : s;
};

const normalizeFinanceEntry = (row) => ({
  id: row.id,
  partnerId: row.partner_id || row.partnerId || '',
  projectId: row.project_id || row.projectId || '',
  direction: FINANCE_DIRECTIONS.includes(row.direction) ? row.direction : 'incoming',
  kind: FINANCE_KINDS.includes(row.kind) ? row.kind : 'actual',
  amount: row.amount == null ? 0 : Number(row.amount),
  currency: row.currency || 'ILS',
  occurredOn: toIsoDate(row.occurred_on ?? row.occurredOn),
  dueOn: toIsoDate(row.due_on ?? row.dueOn),
  status: FINANCE_STATUSES.includes(row.status) ? row.status : 'paid',
  category: row.category || '',
  reference: row.reference || '',
  description: row.description || '',
  createdBy: row.created_by || row.createdBy || '',
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || ''),
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || ''),
});

const listFinanceEntries = async (filter = {}) => {
  const where = [];
  const params = [];
  let i = 1;
  if (filter.partnerId) { where.push(usePostgres ? `partner_id = $${i++}` : 'partner_id = ?'); params.push(filter.partnerId); }
  if (filter.projectId) { where.push(usePostgres ? `project_id = $${i++}` : 'project_id = ?'); params.push(filter.projectId); }
  if (filter.status)    { where.push(usePostgres ? `status = $${i++}`     : 'status = ?');     params.push(filter.status); }
  if (filter.kind)      { where.push(usePostgres ? `kind = $${i++}`       : 'kind = ?');       params.push(filter.kind); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  if (usePostgres) {
    const rows = (await pg().query(
      `SELECT * FROM finance_entries ${whereSql} ORDER BY COALESCE(occurred_on, due_on) DESC, created_at DESC`,
      params
    )).rows;
    return rows.map(normalizeFinanceEntry);
  }
  const rows = sqlite().prepare(
    `SELECT * FROM finance_entries ${whereSql} ORDER BY COALESCE(occurred_on, due_on) DESC, created_at DESC`
  ).all(...params);
  return rows.map(normalizeFinanceEntry);
};

const createFinanceEntry = async (payload, actor = '') => {
  const id = newId();
  const now = new Date().toISOString();
  const direction = FINANCE_DIRECTIONS.includes(payload.direction) ? payload.direction : 'incoming';
  const kind = FINANCE_KINDS.includes(payload.kind) ? payload.kind : 'actual';
  const status = FINANCE_STATUSES.includes(payload.status)
    ? payload.status
    : (kind === 'pledge' ? 'pending' : 'paid');
  const data = {
    partnerId:   payload.partnerId || '',
    projectId:   payload.projectId || null,
    direction,
    kind,
    amount:      Number(payload.amount) || 0,
    currency:    payload.currency || 'ILS',
    occurredOn:  toIsoDate(payload.occurredOn) || null,
    dueOn:       toIsoDate(payload.dueOn) || null,
    status,
    category:    payload.category || '',
    reference:   payload.reference || '',
    description: payload.description || '',
    createdBy:   actor || '',
  };
  if (!data.partnerId) throw new Error('partnerId required');
  if (usePostgres) {
    const row = (await pg().query(
      `INSERT INTO finance_entries
       (id, partner_id, project_id, direction, kind, amount, currency, occurred_on, due_on, status, category, reference, description, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING *`,
      [id, data.partnerId, data.projectId, data.direction, data.kind, data.amount, data.currency,
        data.occurredOn, data.dueOn, data.status, data.category, data.reference, data.description, data.createdBy]
    )).rows[0];
    return normalizeFinanceEntry(row);
  }
  sqlite().prepare(
    `INSERT INTO finance_entries
     (id, partner_id, project_id, direction, kind, amount, currency, occurred_on, due_on, status, category, reference, description, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.partnerId, data.projectId || '', data.direction, data.kind, data.amount, data.currency,
    data.occurredOn || '', data.dueOn || '', data.status, data.category, data.reference, data.description, data.createdBy, now, now);
  return normalizeFinanceEntry({ id, ...data, partner_id: data.partnerId, project_id: data.projectId, occurred_on: data.occurredOn, due_on: data.dueOn, created_by: data.createdBy, created_at: now, updated_at: now });
};

const updateFinanceEntry = async (id, patch) => {
  const direction = patch.direction !== undefined ? (FINANCE_DIRECTIONS.includes(patch.direction) ? patch.direction : null) : undefined;
  const kind      = patch.kind      !== undefined ? (FINANCE_KINDS.includes(patch.kind) ? patch.kind : null) : undefined;
  const status    = patch.status    !== undefined ? (FINANCE_STATUSES.includes(patch.status) ? patch.status : null) : undefined;
  const occurredOn = patch.occurredOn !== undefined ? (toIsoDate(patch.occurredOn) || null) : undefined;
  const dueOn      = patch.dueOn      !== undefined ? (toIsoDate(patch.dueOn) || null) : undefined;
  if (usePostgres) {
    const row = (await pg().query(
      `UPDATE finance_entries SET
         partner_id   = COALESCE($2, partner_id),
         project_id   = COALESCE($3, project_id),
         direction    = COALESCE($4, direction),
         kind         = COALESCE($5, kind),
         amount       = COALESCE($6, amount),
         currency     = COALESCE($7, currency),
         occurred_on  = COALESCE($8, occurred_on),
         due_on       = COALESCE($9, due_on),
         status       = COALESCE($10, status),
         category     = COALESCE($11, category),
         reference    = COALESCE($12, reference),
         description  = COALESCE($13, description),
         updated_at   = NOW()
       WHERE id = $1 RETURNING *`,
      [id, patch.partnerId, patch.projectId, direction, kind,
        patch.amount !== undefined ? Number(patch.amount) : null,
        patch.currency, occurredOn, dueOn, status,
        patch.category, patch.reference, patch.description]
    )).rows[0];
    return row ? normalizeFinanceEntry(row) : null;
  }
  const current = sqlite().prepare('SELECT * FROM finance_entries WHERE id = ?').get(id);
  if (!current) return null;
  const now = new Date().toISOString();
  const merged = {
    partner_id:   patch.partnerId  !== undefined ? patch.partnerId  : current.partner_id,
    project_id:   patch.projectId  !== undefined ? (patch.projectId || '') : current.project_id,
    direction:    direction !== undefined && direction !== null ? direction : current.direction,
    kind:         kind      !== undefined && kind      !== null ? kind      : current.kind,
    amount:       patch.amount     !== undefined ? Number(patch.amount) : current.amount,
    currency:     patch.currency   !== undefined ? patch.currency   : current.currency,
    occurred_on:  occurredOn !== undefined ? (occurredOn || '') : current.occurred_on,
    due_on:       dueOn      !== undefined ? (dueOn      || '') : current.due_on,
    status:       status !== undefined && status !== null ? status : current.status,
    category:     patch.category    !== undefined ? patch.category    : current.category,
    reference:    patch.reference   !== undefined ? patch.reference   : current.reference,
    description:  patch.description !== undefined ? patch.description : current.description,
  };
  sqlite().prepare(
    `UPDATE finance_entries SET partner_id=?, project_id=?, direction=?, kind=?, amount=?, currency=?, occurred_on=?, due_on=?, status=?, category=?, reference=?, description=?, updated_at=? WHERE id=?`
  ).run(merged.partner_id, merged.project_id, merged.direction, merged.kind, merged.amount, merged.currency,
    merged.occurred_on, merged.due_on, merged.status, merged.category, merged.reference, merged.description, now, id);
  const row = sqlite().prepare('SELECT * FROM finance_entries WHERE id = ?').get(id);
  return row ? normalizeFinanceEntry(row) : null;
};

const deleteFinanceEntry = async (id) => {
  if (usePostgres) await pg().query('DELETE FROM finance_entries WHERE id = $1', [id]);
  else sqlite().prepare('DELETE FROM finance_entries WHERE id = ?').run(id);
};

const summarizeFinance = (entries) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const sum = (arr) => arr.reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const actuals = entries.filter((e) => e.kind === 'actual');
  const pledges = entries.filter((e) => e.kind === 'pledge');
  const incomingPaid    = actuals.filter((e) => e.direction === 'incoming' && e.status === 'paid');
  const outgoingPaid    = actuals.filter((e) => e.direction === 'outgoing' && e.status === 'paid');
  const pendingIncoming = pledges.filter((e) => e.direction === 'incoming' && (e.status === 'pending' || e.status === 'overdue'));
  const pendingOutgoing = pledges.filter((e) => e.direction === 'outgoing' && (e.status === 'pending' || e.status === 'overdue'));
  const overdue = entries.filter((e) => {
    if (e.status !== 'pending' && e.status !== 'overdue') return false;
    if (!e.dueOn) return false;
    return new Date(e.dueOn).getTime() < today.getTime();
  });
  return {
    received: sum(incomingPaid),
    sent:     sum(outgoingPaid),
    netActual: sum(incomingPaid) - sum(outgoingPaid),
    pledgedIncoming: sum(pendingIncoming),
    pledgedOutgoing: sum(pendingOutgoing),
    overdueAmount: sum(overdue),
    overdueCount: overdue.length,
    entryCount: entries.length,
  };
};

const summarizeFinancePerPartner = async () => {
  const all = await listFinanceEntries();
  const map = {};
  for (const e of all) {
    if (!map[e.partnerId]) map[e.partnerId] = [];
    map[e.partnerId].push(e);
  }
  const out = {};
  for (const [pid, list] of Object.entries(map)) out[pid] = summarizeFinance(list);
  return out;
};

const createUser = async (username, pin, displayName = username) => {
  const { algorithm, salt, hash } = await hashPinBcrypt(pin);
  if (usePostgres) {
    await pg().query(
      `INSERT INTO users (username, display_name, pin_salt, pin_hash, pin_algorithm, active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (username) DO NOTHING`,
      [username, displayName, salt, hash, algorithm]
    );
  } else {
    sqlite().prepare(`
      INSERT OR IGNORE INTO users (username, displayName, pinSalt, pinHash, pinAlgorithm, active, createdAt)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(username, displayName, salt, hash, algorithm, new Date().toISOString());
  }
};

const deleteUser = async (username) => {
  if (usePostgres) {
    await pg().query('DELETE FROM users WHERE username = $1', [username]);
  } else {
    sqlite().prepare('DELETE FROM users WHERE username = ?').run(username);
  }
};

const upgradeUserToBcrypt = async (username, pin) => {
  const { algorithm, salt, hash } = await hashPinBcrypt(pin);
  if (usePostgres) {
    await pg().query(
      `UPDATE users SET pin_salt = $1, pin_hash = $2, pin_algorithm = $3 WHERE username = $4`,
      [salt, hash, algorithm, username]
    );
  } else {
    sqlite().prepare(
      `UPDATE users SET pinSalt = ?, pinHash = ?, pinAlgorithm = ? WHERE username = ?`
    ).run(salt, hash, algorithm, username);
  }
};

const recordLoginAttempt = async ({ username, ip, success }) => {
  try {
    if (usePostgres) {
      await pg().query(
        `INSERT INTO login_attempts (username, ip, success) VALUES ($1, $2, $3)`,
        [username || null, ip || null, Boolean(success)]
      );
    } else {
      sqlite().prepare(
        `INSERT INTO login_attempts (username, ip, success, attemptedAt) VALUES (?, ?, ?, ?)`
      ).run(username || null, ip || null, success ? 1 : 0, new Date().toISOString());
    }
  } catch (error) {
    console.warn('[security] Failed to record login attempt:', error.message);
  }
};

const recentFailedLoginCount = async ({ username, ip, windowMs }) => {
  const sinceIso = new Date(Date.now() - windowMs).toISOString();
  try {
    if (usePostgres) {
      const result = await pg().query(
        `SELECT COUNT(*) AS count FROM login_attempts
         WHERE success = FALSE AND attempted_at >= $1
           AND ((ip IS NOT NULL AND ip = $2) OR (username IS NOT NULL AND username = $3))`,
        [sinceIso, ip || null, username || null]
      );
      return Number(result.rows[0].count);
    }
    const row = sqlite().prepare(
      `SELECT COUNT(*) AS count FROM login_attempts
       WHERE success = 0 AND attemptedAt >= ?
         AND ((ip IS NOT NULL AND ip = ?) OR (username IS NOT NULL AND username = ?))`
    ).get(sinceIso, ip || null, username || null);
    return Number(row?.count || 0);
  } catch (error) {
    console.warn('[security] Failed to count login attempts:', error.message);
    return 0;
  }
};

const login = async (username, pin) => {
  const user = usePostgres
    ? (await pg().query('SELECT * FROM users WHERE username = $1 AND active = TRUE', [username])).rows[0]
    : sqlite().prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);

  if (!user) return null;
  const salt = user.pin_salt || user.pinSalt;
  const hash = user.pin_hash || user.pinHash;
  const algorithm = detectAlgorithm(user);

  let ok = false;
  if (algorithm === 'bcrypt') {
    ok = await verifyBcryptPin(pin, hash);
  } else {
    ok = verifyLegacyPin(pin, salt, hash);
    if (ok) {
      try {
        await upgradeUserToBcrypt(username, pin);
      } catch (error) {
        console.warn('[security] Legacy login succeeded but bcrypt upgrade failed:', error.message);
      }
    }
  }
  if (!ok) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = sessionExpiry();
  if (usePostgres) {
    await pg().query('INSERT INTO sessions (token, username, expires_at) VALUES ($1, $2, $3)', [token, username, expiresAt]);
  } else {
    sqlite().prepare('INSERT INTO sessions (token, username, expiresAt, createdAt) VALUES (?, ?, ?, ?)').run(token, username, expiresAt, new Date().toISOString());
  }
  return { token, expiresAt, user: { username, displayName: user.display_name || user.displayName } };
};

const getSession = async (token) => {
  if (!token) return null;
  const now = new Date().toISOString();
  const row = usePostgres
    ? (await pg().query(`
        SELECT s.token, s.username, s.expires_at AS "expiresAt", u.display_name AS "displayName"
        FROM sessions s JOIN users u ON u.username = s.username
        WHERE s.token = $1 AND s.expires_at > NOW() AND u.active = TRUE
      `, [token])).rows[0]
    : sqlite().prepare(`
        SELECT s.token, s.username, s.expiresAt, u.displayName
        FROM sessions s JOIN users u ON u.username = s.username
        WHERE s.token = ? AND s.expiresAt > ? AND u.active = 1
      `).get(token, now);
  return row || null;
};

const logout = async (token) => {
  if (!token) return;
  if (usePostgres) await pg().query('DELETE FROM sessions WHERE token = $1', [token]);
  else sqlite().prepare('DELETE FROM sessions WHERE token = ?').run(token);
};

const countPartners = async () => {
  if (usePostgres) return Number((await pg().query('SELECT COUNT(*) AS count FROM partners')).rows[0].count);
  return sqlite().prepare('SELECT COUNT(*) AS count FROM partners_json').get().count;
};

const readAllPartners = async () => {
  if (usePostgres) {
    const rows = (await pg().query('SELECT data FROM partners ORDER BY row_order ASC, created_at DESC')).rows;
    return rows.map((row) => row.data);
  }
  return sqlite().prepare('SELECT data FROM partners_json ORDER BY rowOrder ASC, createdAt DESC').all().map((row) => JSON.parse(row.data));
};

const readPartner = async (id) => {
  if (usePostgres) {
    const row = (await pg().query('SELECT data FROM partners WHERE id = $1', [id])).rows[0];
    return row?.data || null;
  }
  const row = sqlite().prepare('SELECT data FROM partners_json WHERE id = ?').get(id);
  return row ? JSON.parse(row.data) : null;
};

const savePartner = async (partner, rowOrder = 0) => {
  const p = normalizePartner(partner, rowOrder);
  if (usePostgres) {
    await pg().query(`
      INSERT INTO partners (id, organization_name, data, row_order, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        organization_name = EXCLUDED.organization_name,
        data = EXCLUDED.data,
        row_order = EXCLUDED.row_order,
        created_at = EXCLUDED.created_at
    `, [p.id, p.organizationName, p, rowOrder, p.createdAt]);
  } else {
    sqlite().prepare(`
      INSERT INTO partners_json (id, organizationName, data, rowOrder, createdAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        organizationName = excluded.organizationName,
        data = excluded.data,
        rowOrder = excluded.rowOrder,
        createdAt = excluded.createdAt
    `).run(p.id, p.organizationName, JSON.stringify(p), rowOrder, p.createdAt);
  }
  return p;
};

const createPartner = async (partner) => {
  const minRow = usePostgres
    ? (await pg().query('SELECT MIN(row_order) AS min_row FROM partners')).rows[0].min_row
    : sqlite().prepare('SELECT MIN(rowOrder) AS minRow FROM partners_json').get().minRow;
  return savePartner(partner, Number.isFinite(Number(minRow)) ? Number(minRow) - 1 : 0);
};

const updatePartner = async (id, patch) => {
  const current = await readPartner(id);
  if (!current) return null;
  return savePartner({ ...current, ...patch, id }, current.rowOrder || 0);
};

const deletePartner = async (id) => {
  const partner = await readPartner(id);
  if (!partner) return null;
  if (usePostgres) await pg().query('DELETE FROM partners WHERE id = $1', [id]);
  else sqlite().prepare('DELETE FROM partners_json WHERE id = ?').run(id);
  return partner;
};

const replaceAllPartners = async (partners) => {
  if (usePostgres) {
    const client = await pg().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM partners');
      for (let index = 0; index < partners.length; index += 1) {
        const p = normalizePartner(partners[index], index);
        await client.query(`
          INSERT INTO partners (id, organization_name, data, row_order, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [p.id, p.organizationName, p, index, p.createdAt]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const db = sqlite();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM partners_json').run();
    partners.forEach((partner, index) => {
      const p = normalizePartner(partner, index);
      db.prepare('INSERT INTO partners_json (id, organizationName, data, rowOrder, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(p.id, p.organizationName, JSON.stringify(p), index, p.createdAt);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

const readSettings = async (username) => {
  if (usePostgres) {
    const row = (await pg().query('SELECT settings FROM user_settings WHERE username = $1', [username])).rows[0];
    return row?.settings || {};
  }
  const row = sqlite().prepare('SELECT settings FROM user_settings WHERE username = ?').get(username);
  if (row) return JSON.parse(row.settings);
  if (fs.existsSync(privateSettingsPath)) {
    try {
      const allSettings = JSON.parse(fs.readFileSync(privateSettingsPath, 'utf8'));
      return allSettings[username] || {};
    } catch {
      return {};
    }
  }
  return {};
};

const writeSettings = async (username, settings) => {
  if (usePostgres) {
    await pg().query(`
      INSERT INTO user_settings (username, settings) VALUES ($1, $2)
      ON CONFLICT (username) DO UPDATE SET settings = EXCLUDED.settings
    `, [username, settings]);
  } else {
    sqlite().prepare(`
      INSERT INTO user_settings (username, settings) VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET settings = excluded.settings
    `).run(username, JSON.stringify(settings));
  }
};

// ── Tags ──────────────────────────────────────────────────────────────────────

const listTags = async () => {
  if (usePostgres) {
    return (await pg().query('SELECT * FROM tags ORDER BY label')).rows;
  }
  return sqlite().prepare('SELECT * FROM tags ORDER BY label').all();
};

const createTag = async (id, label, color) => {
  if (usePostgres) {
    const row = (await pg().query(
      `INSERT INTO tags (id, label, color, created_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (label) DO UPDATE SET color = EXCLUDED.color
       RETURNING *`,
      [id, label, color]
    )).rows[0];
    return row;
  }
  sqlite().prepare(
    `INSERT OR REPLACE INTO tags (id, label, color, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, label, color, new Date().toISOString());
  return { id, label, color };
};

const deleteTag = async (id) => {
  if (usePostgres) await pg().query('DELETE FROM tags WHERE id = $1', [id]);
  else sqlite().prepare('DELETE FROM tags WHERE id = ?').run(id);
};

// ── App Options ────────────────────────────────────────────────────────────────

const listOptions = async (optionType) => {
  if (usePostgres) {
    return (await pg().query(
      'SELECT * FROM app_options WHERE option_type = $1 ORDER BY sort_order, label',
      [optionType]
    )).rows;
  }
  return sqlite().prepare(
    'SELECT * FROM app_options WHERE option_type = ? ORDER BY sort_order, label'
  ).all(optionType);
};

const createOption = async (id, optionType, label, color, isDefault = false, sortOrder = 0) => {
  if (usePostgres) {
    const row = (await pg().query(
      `INSERT INTO app_options (id, option_type, label, color, is_default, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, color = EXCLUDED.color
       RETURNING *`,
      [id, optionType, label, color, isDefault, sortOrder]
    )).rows[0];
    return row;
  }
  sqlite().prepare(
    `INSERT OR REPLACE INTO app_options (id, option_type, label, color, is_default, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, optionType, label, color, isDefault ? 1 : 0, sortOrder, new Date().toISOString());
  return { id, option_type: optionType, label, color, is_default: isDefault ? 1 : 0, sort_order: sortOrder };
};

const deleteOption = async (id) => {
  if (usePostgres) await pg().query('DELETE FROM app_options WHERE id = $1', [id]);
  else sqlite().prepare('DELETE FROM app_options WHERE id = ?').run(id);
};

// ── Projects ───────────────────────────────────────────────────────────────────

const toJsonbParam = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

const parseJsonField = (raw, fallback) => {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const PROJECT_JSON_FIELDS = ['attachments', 'field_labels', 'tasks', 'comments', 'change_history', 'labels', 'metrics'];

const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'];

const normalizeTask = (t) => {
  let status = t.status;
  if (!TASK_STATUSES.includes(status)) status = t.completed ? 'done' : 'todo';
  return {
    id: t.id || newId(),
    title: t.title || '',
    status,
    completed: status === 'done',
    assignee: t.assignee || '',
    due_date: t.due_date || null,
    sort_order: typeof t.sort_order === 'number' ? t.sort_order : 0,
    created_at: t.created_at || new Date().toISOString(),
  };
};

const normalizeComment = (c) => ({
  id: c.id || newId(),
  author: c.author || '',
  authorUsername: c.authorUsername || '',
  body: c.body || '',
  mentions: Array.isArray(c.mentions) ? c.mentions : [],
  created_at: c.created_at || new Date().toISOString(),
});

const METRIC_TYPES = ['input', 'activity', 'output', 'outcome', 'long_term'];

const normalizeDataPoint = (d) => ({
  id: d.id || newId(),
  at: d.at || new Date().toISOString(),
  value: typeof d.value === 'number' ? d.value : Number(d.value) || 0,
  note: d.note || '',
  byDisplay: d.byDisplay || '',
});

const normalizeMetric = (m) => {
  let type = m.type;
  if (!METRIC_TYPES.includes(type)) type = 'output';
  return {
    id: m.id || newId(),
    name: m.name || '',
    type,
    unit: m.unit || '',
    target: m.target == null ? null : Number(m.target),
    baseline: m.baseline == null ? null : Number(m.baseline),
    data_points: Array.isArray(m.data_points) ? m.data_points.map(normalizeDataPoint) : [],
    created_at: m.created_at || new Date().toISOString(),
  };
};

const normalizeProjectRow = (row) => {
  if (!row) return row;
  const out = { ...row };
  out.attachments = Array.isArray(out.attachments) ? out.attachments : parseJsonField(out.attachments, []);
  out.field_labels = (out.field_labels && typeof out.field_labels === 'object' && !Array.isArray(out.field_labels)) ? out.field_labels : parseJsonField(out.field_labels, {});
  out.tasks = (Array.isArray(out.tasks) ? out.tasks : parseJsonField(out.tasks, [])).map(normalizeTask);
  out.comments = (Array.isArray(out.comments) ? out.comments : parseJsonField(out.comments, [])).map(normalizeComment);
  out.change_history = Array.isArray(out.change_history) ? out.change_history : parseJsonField(out.change_history, []);
  out.labels = Array.isArray(out.labels) ? out.labels : parseJsonField(out.labels, []);
  out.metrics = (Array.isArray(out.metrics) ? out.metrics : parseJsonField(out.metrics, [])).map(normalizeMetric);
  out.stage = out.stage || '';
  out.priority = out.priority || '';
  out.owner = out.owner || '';
  out.goal = out.goal || '';
  out.is_template = Boolean(out.is_template);
  if (out.due_date instanceof Date) out.due_date = out.due_date.toISOString().split('T')[0];
  if (out.start_date instanceof Date) out.start_date = out.start_date.toISOString().split('T')[0];
  return out;
};

const buildProjectHistory = (current, patch, by) => {
  const entries = [];
  const now = new Date().toISOString();
  const byDisplay = by || 'לא ידוע';
  const labelMap = {
    stage: 'שלב',
    priority: 'עדיפות',
    owner: 'אחראי',
    due_date: 'מועד יעד',
    start_date: 'מועד התחלה',
    title: 'כותרת',
    status: 'סטטוס',
    leading_department: 'מחלקה מובילה',
    activity_year: 'שנת פעילות',
    drive_link: 'קישור Drive',
    goal: 'מטרה',
  };
  for (const field of Object.keys(labelMap)) {
    if (patch[field] !== undefined && String(patch[field] ?? '') !== String(current[field] ?? '')) {
      entries.push({
        id: newId(), at: now, by: byDisplay, byDisplay,
        action: `field_${field}`,
        summary: `שינה ${labelMap[field]}`,
      });
    }
  }
  return entries;
};

const listProjects = async () => {
  if (usePostgres) {
    const rows = (await pg().query('SELECT * FROM projects WHERE is_template = FALSE OR is_template IS NULL ORDER BY updated_at DESC')).rows.map(normalizeProjectRow);
    const links = (await pg().query('SELECT project_id, partner_id, contact_id FROM project_partners')).rows;
    const byProject = {};
    for (const l of links) {
      if (!byProject[l.project_id]) byProject[l.project_id] = [];
      byProject[l.project_id].push({ partner_id: l.partner_id, contact_id: l.contact_id });
    }
    return rows.map((p) => ({ ...p, partners: byProject[p.id] || [] }));
  }
  const rows = sqlite().prepare('SELECT * FROM projects WHERE COALESCE(is_template, 0) = 0 ORDER BY updated_at DESC').all().map(normalizeProjectRow);
  const links = sqlite().prepare('SELECT project_id, partner_id, contact_id FROM project_partners').all();
  const byProject = {};
  for (const l of links) {
    if (!byProject[l.project_id]) byProject[l.project_id] = [];
    byProject[l.project_id].push({ partner_id: l.partner_id, contact_id: l.contact_id });
  }
  return rows.map((p) => ({ ...p, partners: byProject[p.id] || [] }));
};

const listProjectsForPartner = async (partnerId) => {
  if (usePostgres) {
    const rows = (await pg().query(
      `SELECT p.*, pp.contact_id AS linked_contact_id FROM projects p
       JOIN project_partners pp ON pp.project_id = p.id
       WHERE pp.partner_id = $1 ORDER BY p.updated_at DESC`,
      [partnerId]
    )).rows.map(normalizeProjectRow);
    return rows;
  }
  const rows = sqlite().prepare(
    `SELECT p.*, pp.contact_id AS linked_contact_id FROM projects p
     JOIN project_partners pp ON pp.project_id = p.id
     WHERE pp.partner_id = ? ORDER BY p.updated_at DESC`
  ).all(partnerId).map(normalizeProjectRow);
  return rows;
};

const getProject = async (id) => {
  let project;
  if (usePostgres) {
    const row = (await pg().query('SELECT * FROM projects WHERE id = $1', [id])).rows[0];
    if (!row) return null;
    project = normalizeProjectRow(row);
    const links = (await pg().query(
      'SELECT partner_id, contact_id FROM project_partners WHERE project_id = $1',
      [id]
    )).rows;
    project.partners = links;
  } else {
    const row = sqlite().prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return null;
    project = normalizeProjectRow(row);
    const links = sqlite().prepare('SELECT partner_id, contact_id FROM project_partners WHERE project_id = ?').all(id);
    project.partners = links;
  }
  return project;
};

const createProject = async (id, title, description, leadingDepartment, fieldLabels = {}, activityYear = null, driveLink = null, attachments = [], extras = {}) => {
  const now = new Date().toISOString();
  const stage = extras.stage || '';
  const priority = extras.priority || '';
  const owner = extras.owner || '';
  const dueDate = extras.due_date || null;
  const startDate = extras.start_date || null;
  const goal = extras.goal || '';
  const labels = Array.isArray(extras.labels) ? extras.labels : [];
  const tasks = Array.isArray(extras.tasks) ? extras.tasks : [];
  const comments = Array.isArray(extras.comments) ? extras.comments : [];
  const changeHistory = Array.isArray(extras.change_history) ? extras.change_history : [];
  const metrics = Array.isArray(extras.metrics) ? extras.metrics : [];
  const isTemplate = Boolean(extras.is_template);

  if (usePostgres) {
    const row = (await pg().query(
      `INSERT INTO projects
       (id, title, description, leading_department, field_labels, activity_year, drive_link, attachments,
        stage, priority, owner, due_date, start_date, tasks, comments, change_history, labels, goal, metrics, is_template, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW()) RETURNING *`,
      [id, title, description || null, leadingDepartment || null,
        JSON.stringify(fieldLabels || {}), activityYear || null, driveLink || null, JSON.stringify(attachments || []),
        stage, priority, owner, dueDate, startDate,
        JSON.stringify(tasks), JSON.stringify(comments), JSON.stringify(changeHistory), JSON.stringify(labels),
        goal, JSON.stringify(metrics), isTemplate]
    )).rows[0];
    return { ...normalizeProjectRow(row), partners: [] };
  }
  sqlite().prepare(
    `INSERT INTO projects
     (id, title, description, leading_department, field_labels, activity_year, drive_link, attachments,
      stage, priority, owner, due_date, start_date, tasks, comments, change_history, labels, goal, metrics, is_template, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, title, description || null, leadingDepartment || null,
    JSON.stringify(fieldLabels), activityYear || null, driveLink || null, JSON.stringify(attachments),
    stage, priority, owner, dueDate, startDate,
    JSON.stringify(tasks), JSON.stringify(comments), JSON.stringify(changeHistory), JSON.stringify(labels),
    goal, JSON.stringify(metrics), isTemplate ? 1 : 0,
    now, now);
  return normalizeProjectRow({
    id, title, description: description || null, leading_department: leadingDepartment || null, status: 'active',
    field_labels: fieldLabels, activity_year: activityYear, drive_link: driveLink, attachments,
    stage, priority, owner, due_date: dueDate, start_date: startDate,
    tasks, comments, change_history: changeHistory, labels, goal, metrics, is_template: isTemplate,
    created_at: now, updated_at: now,
  });
};

const listProjectTemplates = async () => {
  if (usePostgres) {
    const rows = (await pg().query('SELECT * FROM projects WHERE is_template = TRUE ORDER BY updated_at DESC')).rows;
    return rows.map(normalizeProjectRow);
  }
  const rows = sqlite().prepare('SELECT * FROM projects WHERE is_template = 1 ORDER BY updated_at DESC').all();
  return rows.map(normalizeProjectRow);
};

const cloneProjectFromTemplate = async (templateId, overrides = {}) => {
  const tpl = await getProject(templateId);
  if (!tpl || !tpl.is_template) return null;
  const id = newId();
  const tasks = (tpl.tasks || []).map((t) => ({
    id: newId(),
    title: t.title || '',
    status: 'todo',
    completed: false,
    assignee: '',
    due_date: null,
    sort_order: t.sort_order || 0,
    created_at: new Date().toISOString(),
  }));
  const metrics = (tpl.metrics || []).map((m) => ({
    id: newId(),
    name: m.name,
    type: m.type,
    unit: m.unit,
    target: m.target,
    baseline: m.baseline,
    data_points: [],
    created_at: new Date().toISOString(),
  }));
  return createProject(
    id,
    overrides.title || `עותק: ${tpl.title}`,
    tpl.description || null,
    tpl.leading_department || null,
    tpl.field_labels || {},
    overrides.activity_year || tpl.activity_year || null,
    null,
    [],
    {
      stage: overrides.stage || tpl.stage || '',
      priority: tpl.priority || '',
      owner: overrides.owner || '',
      goal: tpl.goal || '',
      tasks,
      metrics,
      is_template: false,
    }
  );
};

const updateProject = async (id, patch, actor = null) => {
  const current = await getProject(id);
  if (!current) return null;
  const now = new Date().toISOString();
  const historyEntries = buildProjectHistory(current, patch, actor);
  const nextHistory = Array.isArray(current.change_history) ? current.change_history.concat(historyEntries).slice(-50) : historyEntries;

  if (usePostgres) {
    const row = (await pg().query(
      `UPDATE projects SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         leading_department = COALESCE($4, leading_department),
         status = COALESCE($5, status),
         field_labels = COALESCE($6, field_labels),
         activity_year = COALESCE($7, activity_year),
         drive_link = COALESCE($8, drive_link),
         attachments = COALESCE($9, attachments),
         stage = COALESCE($10, stage),
         priority = COALESCE($11, priority),
         owner = COALESCE($12, owner),
         due_date = COALESCE($13, due_date),
         start_date = COALESCE($14, start_date),
         tasks = COALESCE($15, tasks),
         comments = COALESCE($16, comments),
         labels = COALESCE($17, labels),
         goal = COALESCE($19, goal),
         metrics = COALESCE($20, metrics),
         is_template = COALESCE($21, is_template),
         change_history = $18,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, patch.title, patch.description, patch.leading_department, patch.status,
        toJsonbParam(patch.field_labels), patch.activity_year, patch.drive_link, toJsonbParam(patch.attachments),
        patch.stage, patch.priority, patch.owner, patch.due_date || null, patch.start_date || null,
        toJsonbParam(patch.tasks), toJsonbParam(patch.comments), toJsonbParam(patch.labels),
        JSON.stringify(nextHistory),
        patch.goal === undefined ? null : patch.goal,
        toJsonbParam(patch.metrics),
        patch.is_template === undefined ? null : Boolean(patch.is_template)]
    )).rows[0];
    return row ? normalizeProjectRow(row) : null;
  }
  const merged = {
    title: patch.title !== undefined ? patch.title : current.title,
    description: patch.description !== undefined ? patch.description : current.description,
    leading_department: patch.leading_department !== undefined ? patch.leading_department : current.leading_department,
    status: patch.status !== undefined ? patch.status : current.status,
    field_labels: patch.field_labels !== undefined ? JSON.stringify(patch.field_labels) : JSON.stringify(current.field_labels || {}),
    activity_year: patch.activity_year !== undefined ? patch.activity_year : current.activity_year,
    drive_link: patch.drive_link !== undefined ? patch.drive_link : current.drive_link,
    attachments: patch.attachments !== undefined ? JSON.stringify(patch.attachments) : JSON.stringify(current.attachments || []),
    stage: patch.stage !== undefined ? patch.stage : (current.stage || ''),
    priority: patch.priority !== undefined ? patch.priority : (current.priority || ''),
    owner: patch.owner !== undefined ? patch.owner : (current.owner || ''),
    due_date: patch.due_date !== undefined ? (patch.due_date || null) : (current.due_date || null),
    start_date: patch.start_date !== undefined ? (patch.start_date || null) : (current.start_date || null),
    tasks: patch.tasks !== undefined ? JSON.stringify(patch.tasks) : JSON.stringify(current.tasks || []),
    comments: patch.comments !== undefined ? JSON.stringify(patch.comments) : JSON.stringify(current.comments || []),
    labels: patch.labels !== undefined ? JSON.stringify(patch.labels) : JSON.stringify(current.labels || []),
    goal: patch.goal !== undefined ? (patch.goal || '') : (current.goal || ''),
    metrics: patch.metrics !== undefined ? JSON.stringify(patch.metrics) : JSON.stringify(current.metrics || []),
    is_template: patch.is_template !== undefined ? (patch.is_template ? 1 : 0) : (current.is_template ? 1 : 0),
    change_history: JSON.stringify(nextHistory),
  };
  sqlite().prepare(
    `UPDATE projects SET title=?, description=?, leading_department=?, status=?, field_labels=?, activity_year=?, drive_link=?, attachments=?, stage=?, priority=?, owner=?, due_date=?, start_date=?, tasks=?, comments=?, labels=?, goal=?, metrics=?, is_template=?, change_history=?, updated_at=? WHERE id=?`
  ).run(
    merged.title, merged.description, merged.leading_department, merged.status,
    merged.field_labels, merged.activity_year, merged.drive_link, merged.attachments,
    merged.stage, merged.priority, merged.owner, merged.due_date, merged.start_date,
    merged.tasks, merged.comments, merged.labels, merged.goal, merged.metrics, merged.is_template,
    merged.change_history,
    now, id
  );
  return getProject(id);
};

const deleteProject = async (id) => {
  if (usePostgres) {
    await pg().query('DELETE FROM project_partners WHERE project_id = $1', [id]);
    await pg().query('DELETE FROM projects WHERE id = $1', [id]);
  } else {
    sqlite().prepare('DELETE FROM project_partners WHERE project_id = ?').run(id);
    sqlite().prepare('DELETE FROM projects WHERE id = ?').run(id);
  }
};

const addProjectPartner = async (projectId, partnerId, contactId) => {
  if (usePostgres) {
    await pg().query(
      `INSERT INTO project_partners (project_id, partner_id, contact_id) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, partner_id) DO UPDATE SET contact_id = EXCLUDED.contact_id`,
      [projectId, partnerId, contactId || null]
    );
  } else {
    sqlite().prepare(
      `INSERT OR REPLACE INTO project_partners (project_id, partner_id, contact_id) VALUES (?, ?, ?)`
    ).run(projectId, partnerId, contactId || null);
  }
};

const removeProjectPartner = async (projectId, partnerId) => {
  if (usePostgres) await pg().query('DELETE FROM project_partners WHERE project_id = $1 AND partner_id = $2', [projectId, partnerId]);
  else sqlite().prepare('DELETE FROM project_partners WHERE project_id = ? AND partner_id = ?').run(projectId, partnerId);
};

const extractMentions = (body, users) => {
  const names = new Set(users.map((user) => user.username));
  const mentions = new Set();
  for (const match of body.matchAll(/@([^\s@,.;:!?]+)/g)) {
    if (names.has(match[1])) mentions.add(match[1]);
  }
  return Array.from(mentions);
};

const createMessage = async ({
  partnerId = null,
  senderUsername,
  recipientUsername = null,
  messageType = 'text',
  body,
  metadata = null,
  replyToMessageId = null,
}) => {
  const users = await listUsers(false);
  const allowedTypes = new Set(['text', 'partner_card', 'contact_card']);
  const type = allowedTypes.has(messageType) ? messageType : 'text';
  const trimmedBody = String(body == null ? '' : body).trim();

  if (type === 'partner_card') {
    if (!partnerId) {
      const error = new Error('partnerId is required for partner_card messages');
      error.code = 'INVALID_INPUT';
      throw error;
    }
  } else if (type === 'contact_card') {
    if (!partnerId) {
      const error = new Error('partnerId is required for contact_card messages');
      error.code = 'INVALID_INPUT';
      throw error;
    }
    if (!metadata || !metadata.contact || !metadata.contact.name) {
      const error = new Error('Contact payload is required for contact_card messages');
      error.code = 'INVALID_INPUT';
      throw error;
    }
  } else if (!trimmedBody) {
    const error = new Error('Message body is required');
    error.code = 'EMPTY_BODY';
    throw error;
  }

  if (recipientUsername && !users.some((user) => user.username === recipientUsername)) {
    const error = new Error('Recipient user not found');
    error.code = 'UNKNOWN_RECIPIENT';
    throw error;
  }

  const message = {
    id: newId(),
    partnerId: partnerId || null,
    senderUsername,
    recipientUsername: recipientUsername || null,
    messageType: type,
    body: trimmedBody,
    mentions: extractMentions(trimmedBody, users),
    metadata: metadata || null,
    replyToMessageId: replyToMessageId || null,
    createdAt: new Date().toISOString(),
  };

  if (usePostgres) {
    await pg().query(`
      INSERT INTO messages (id, partner_id, sender_username, recipient_username, message_type, body, mentions, metadata, reply_to_message_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
    `, [
      message.id,
      message.partnerId,
      message.senderUsername,
      message.recipientUsername,
      message.messageType,
      message.body,
      JSON.stringify(message.mentions),
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.replyToMessageId,
      message.createdAt,
    ]);
  } else {
    sqlite().prepare(`
      INSERT INTO messages (id, partnerId, senderUsername, recipientUsername, messageType, body, mentions, metadata, replyToMessageId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      message.partnerId,
      message.senderUsername,
      message.recipientUsername,
      message.messageType,
      message.body,
      JSON.stringify(message.mentions),
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.replyToMessageId,
      message.createdAt
    );
  }
  return message;
};

const parseMaybeJson = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const mapPgMessageRow = (row) => ({
  id: row.id,
  partnerId: row.partnerId,
  senderUsername: row.senderUsername,
  recipientUsername: row.recipientUsername || null,
  messageType: row.messageType || 'text',
  body: row.body,
  mentions: Array.isArray(row.mentions) ? row.mentions : (row.mentions || []),
  metadata: row.metadata ? (typeof row.metadata === 'object' ? row.metadata : parseMaybeJson(row.metadata)) : null,
  replyToMessageId: row.replyToMessageId || null,
  createdAt: row.createdAt,
  read: Boolean(row.read),
});

const mapSqliteMessageRow = (row, currentUsername) => ({
  id: row.id,
  partnerId: row.partnerId,
  senderUsername: row.senderUsername,
  recipientUsername: row.recipientUsername || null,
  messageType: row.messageType || 'text',
  body: row.body,
  mentions: JSON.parse(row.mentions || '[]'),
  metadata: parseMaybeJson(row.metadata),
  replyToMessageId: row.replyToMessageId || null,
  createdAt: row.createdAt,
  read: Boolean(row.readUsername) || row.senderUsername === currentUsername,
});

const groupReactions = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const messageId = row.message_id || row.messageId;
    const username = row.username;
    const emoji = row.emoji;
    if (!map.has(messageId)) map.set(messageId, new Map());
    const byEmoji = map.get(messageId);
    if (!byEmoji.has(emoji)) byEmoji.set(emoji, []);
    byEmoji.get(emoji).push(username);
  }
  const result = {};
  for (const [messageId, byEmoji] of map.entries()) {
    result[messageId] = Array.from(byEmoji.entries()).map(([emoji, users]) => ({
      emoji,
      count: users.length,
      users,
    }));
  }
  return result;
};

const fetchReactionsForMessages = async (messageIds) => {
  if (!Array.isArray(messageIds) || messageIds.length === 0) return {};
  if (usePostgres) {
    const result = await pg().query(
      `SELECT message_id, username, emoji FROM message_reactions WHERE message_id = ANY($1::text[])`,
      [messageIds]
    );
    return groupReactions(result.rows);
  }
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = sqlite().prepare(
    `SELECT messageId AS message_id, username, emoji FROM message_reactions WHERE messageId IN (${placeholders})`
  ).all(...messageIds);
  return groupReactions(rows);
};

const attachReactions = async (messages) => {
  if (!messages.length) return messages;
  const ids = messages.map((m) => m.id);
  const grouped = await fetchReactionsForMessages(ids);
  return messages.map((m) => ({ ...m, reactions: grouped[m.id] || [] }));
};

const toggleReaction = async (messageId, username, emoji) => {
  const cleanEmoji = String(emoji || '').trim();
  if (!cleanEmoji) {
    const error = new Error('emoji is required');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  if (usePostgres) {
    const existing = await pg().query(
      `SELECT 1 FROM message_reactions WHERE message_id = $1 AND username = $2 AND emoji = $3`,
      [messageId, username, cleanEmoji]
    );
    if (existing.rowCount > 0) {
      await pg().query(
        `DELETE FROM message_reactions WHERE message_id = $1 AND username = $2 AND emoji = $3`,
        [messageId, username, cleanEmoji]
      );
    } else {
      await pg().query(
        `INSERT INTO message_reactions (message_id, username, emoji, created_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (message_id, username, emoji) DO NOTHING`,
        [messageId, username, cleanEmoji]
      );
    }
  } else {
    const db = sqlite();
    const existing = db.prepare(
      `SELECT 1 FROM message_reactions WHERE messageId = ? AND username = ? AND emoji = ?`
    ).get(messageId, username, cleanEmoji);
    if (existing) {
      db.prepare(`DELETE FROM message_reactions WHERE messageId = ? AND username = ? AND emoji = ?`)
        .run(messageId, username, cleanEmoji);
    } else {
      db.prepare(
        `INSERT OR IGNORE INTO message_reactions (messageId, username, emoji, createdAt) VALUES (?, ?, ?, ?)`
      ).run(messageId, username, cleanEmoji, new Date().toISOString());
    }
  }
  const grouped = await fetchReactionsForMessages([messageId]);
  return grouped[messageId] || [];
};

const readMessage = async (messageId) => {
  if (!messageId) return null;
  if (usePostgres) {
    const row = (await pg().query(
      `SELECT id, partner_id AS "partnerId", sender_username AS "senderUsername",
              recipient_username AS "recipientUsername", message_type AS "messageType",
              body, mentions, metadata, reply_to_message_id AS "replyToMessageId",
              created_at AS "createdAt"
       FROM messages WHERE id = $1`,
      [messageId]
    )).rows[0];
    return row ? mapPgMessageRow({ ...row, read: true }) : null;
  }
  const row = sqlite().prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId);
  return row ? mapSqliteMessageRow(row, row.senderUsername) : null;
};

const listMessages = async ({ username, partnerId = null }) => {
  let messages;
  if (usePostgres) {
    const rows = (await pg().query(`
      SELECT m.id, m.partner_id AS "partnerId", m.sender_username AS "senderUsername",
             m.recipient_username AS "recipientUsername", m.message_type AS "messageType",
             m.body, m.mentions, m.metadata, m.reply_to_message_id AS "replyToMessageId",
             m.created_at AS "createdAt",
             CASE WHEN mr.username IS NULL AND m.sender_username <> $1 THEN FALSE ELSE TRUE END AS read
      FROM messages m
      LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.username = $1
      WHERE m.recipient_username IS NULL
        AND ($2::text IS NULL OR m.partner_id = $2)
      ORDER BY m.created_at DESC
      LIMIT 100
    `, [username, partnerId])).rows;
    messages = rows.map(mapPgMessageRow);
  } else {
    const rows = sqlite().prepare(`
      SELECT m.*, r.username AS readUsername
      FROM messages m
      LEFT JOIN message_reads r ON r.messageId = m.id AND r.username = ?
      WHERE m.recipientUsername IS NULL
        AND (? IS NULL OR m.partnerId = ?)
      ORDER BY m.createdAt DESC
      LIMIT 100
    `).all(username, partnerId, partnerId);
    messages = rows.map((row) => mapSqliteMessageRow(row, username));
  }
  return attachReactions(messages);
};

const listConversation = async (currentUsername, otherUsername) => {
  let messages;
  if (usePostgres) {
    const rows = (await pg().query(`
      SELECT m.id, m.partner_id AS "partnerId", m.sender_username AS "senderUsername",
             m.recipient_username AS "recipientUsername", m.message_type AS "messageType",
             m.body, m.mentions, m.metadata, m.reply_to_message_id AS "replyToMessageId",
             m.created_at AS "createdAt",
             CASE WHEN mr.username IS NULL AND m.sender_username <> $1 THEN FALSE ELSE TRUE END AS read
      FROM messages m
      LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.username = $1
      WHERE (m.sender_username = $1 AND m.recipient_username = $2)
         OR (m.sender_username = $2 AND m.recipient_username = $1)
      ORDER BY m.created_at ASC
      LIMIT 500
    `, [currentUsername, otherUsername])).rows;
    messages = rows.map(mapPgMessageRow);
  } else {
    const rows = sqlite().prepare(`
      SELECT m.*, r.username AS readUsername
      FROM messages m
      LEFT JOIN message_reads r ON r.messageId = m.id AND r.username = ?
      WHERE (m.senderUsername = ? AND m.recipientUsername = ?)
         OR (m.senderUsername = ? AND m.recipientUsername = ?)
      ORDER BY m.createdAt ASC
      LIMIT 500
    `).all(currentUsername, currentUsername, otherUsername, otherUsername, currentUsername);
    messages = rows.map((row) => mapSqliteMessageRow(row, currentUsername));
  }
  return attachReactions(messages);
};

const listInbox = async (currentUsername) => {
  if (usePostgres) {
    const rows = (await pg().query(`
      WITH conversations AS (
        SELECT
          CASE WHEN sender_username = $1 THEN recipient_username ELSE sender_username END AS counterpart,
          id, partner_id AS "partnerId", sender_username AS "senderUsername",
          recipient_username AS "recipientUsername", message_type AS "messageType",
          body, mentions, metadata, reply_to_message_id AS "replyToMessageId",
          created_at AS "createdAt"
        FROM messages
        WHERE recipient_username IS NOT NULL
          AND (sender_username = $1 OR recipient_username = $1)
      ),
      ranked AS (
        SELECT c.*, ROW_NUMBER() OVER (PARTITION BY counterpart ORDER BY "createdAt" DESC) AS rn
        FROM conversations c
      )
      SELECT r.counterpart, r.id, r."partnerId", r."senderUsername", r."recipientUsername",
             r."messageType", r.body, r.mentions, r.metadata, r."replyToMessageId", r."createdAt",
             u.display_name AS "counterpartDisplayName",
             (SELECT COUNT(*) FROM messages m
                LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.username = $1
                WHERE m.recipient_username = $1
                  AND m.sender_username = r.counterpart
                  AND mr.username IS NULL) AS "unreadCount"
      FROM ranked r
      LEFT JOIN users u ON u.username = r.counterpart
      WHERE r.rn = 1
      ORDER BY r."createdAt" DESC
    `, [currentUsername])).rows;
    return rows.map((row) => ({
      counterpart: row.counterpart,
      counterpartDisplayName: row.counterpartDisplayName || row.counterpart,
      lastMessage: mapPgMessageRow({ ...row, read: true }),
      unreadCount: Number(row.unreadCount || 0),
    }));
  }
  const rows = sqlite().prepare(`
    SELECT m.*, r.username AS readUsername
    FROM messages m
    LEFT JOIN message_reads r ON r.messageId = m.id AND r.username = ?
    WHERE m.recipientUsername IS NOT NULL
      AND (m.senderUsername = ? OR m.recipientUsername = ?)
    ORDER BY m.createdAt DESC
  `).all(currentUsername, currentUsername, currentUsername);
  const grouped = new Map();
  for (const row of rows) {
    const counterpart = row.senderUsername === currentUsername ? row.recipientUsername : row.senderUsername;
    if (!counterpart) continue;
    if (!grouped.has(counterpart)) {
      grouped.set(counterpart, { lastMessage: row, unreadCount: 0 });
    }
    const entry = grouped.get(counterpart);
    if (row.recipientUsername === currentUsername && !row.readUsername) entry.unreadCount += 1;
  }
  const userRows = sqlite().prepare('SELECT username, displayName FROM users').all();
  const displayMap = new Map(userRows.map((u) => [u.username, u.displayName]));
  return Array.from(grouped.entries()).map(([counterpart, value]) => ({
    counterpart,
    counterpartDisplayName: displayMap.get(counterpart) || counterpart,
    lastMessage: mapSqliteMessageRow(value.lastMessage, currentUsername),
    unreadCount: value.unreadCount,
  }));
};

const markMessagesRead = async (username, messageIds) => {
  if (!messageIds.length) return;
  const readAt = new Date().toISOString();
  if (usePostgres) {
    for (const id of messageIds) {
      await pg().query(`
        INSERT INTO message_reads (message_id, username, read_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, username) DO NOTHING
      `, [id, username, readAt]);
    }
  } else {
    const stmt = sqlite().prepare('INSERT OR IGNORE INTO message_reads (messageId, username, readAt) VALUES (?, ?, ?)');
    messageIds.forEach((id) => stmt.run(id, username, readAt));
  }
};

const unreadMessageCount = async (username) => {
  if (usePostgres) {
    return Number((await pg().query(`
      SELECT COUNT(*) AS count
      FROM messages m
      LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.username = $1
      WHERE m.sender_username <> $1
        AND mr.username IS NULL
        AND (m.recipient_username IS NULL OR m.recipient_username = $1)
    `, [username])).rows[0].count);
  }
  return sqlite().prepare(`
    SELECT COUNT(*) AS count
    FROM messages m
    LEFT JOIN message_reads r ON r.messageId = m.id AND r.username = ?
    WHERE m.senderUsername <> ?
      AND r.username IS NULL
      AND (m.recipientUsername IS NULL OR m.recipientUsername = ?)
  `).get(username, username, username).count;
};

const migrateLegacyFiles = () => {
  if (usePostgres) return;
  ensurePrivateStorage();

  if (!fs.existsSync(privateSettingsPath) && fs.existsSync(legacySettingsPath)) {
    backupFile(legacySettingsPath, 'settings');
    fs.copyFileSync(legacySettingsPath, privateSettingsPath);
  }

  const db = sqlite();
  const count = db.prepare('SELECT COUNT(*) AS count FROM partners_json').get().count;
  if (count > 0) return;

  const legacyTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partners'").get();
  if (legacyTable) {
    const legacyRows = db.prepare('SELECT * FROM partners ORDER BY rowOrder ASC, createdAt DESC').all();
    if (legacyRows.length > 0) {
      db.exec('BEGIN');
      try {
        legacyRows.forEach((row, index) => {
          const partner = {};
          for (const [key, value] of Object.entries(row)) {
            if (key === 'rowOrder') continue;
            if (['contacts', 'communicationLog', 'sourceFiles'].includes(key)) {
              try {
                partner[key] = JSON.parse(value || '[]');
              } catch {
                partner[key] = [];
              }
            } else {
              partner[key] = value;
            }
          }
          const p = normalizePartner(partner, index);
          db.prepare('INSERT INTO partners_json (id, organizationName, data, rowOrder, createdAt) VALUES (?, ?, ?, ?, ?)')
            .run(p.id, p.organizationName, JSON.stringify(p), index, p.createdAt);
        });
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return;
    }
  }

  if (!fs.existsSync(legacyDataPath)) return;

  backupFile(legacyDataPath, 'data');
  const legacy = JSON.parse(fs.readFileSync(legacyDataPath, 'utf8'));
  if (Array.isArray(legacy)) {
    db.exec('BEGIN');
    try {
      legacy.forEach((partner, index) => {
        const p = normalizePartner(partner, index);
        db.prepare('INSERT INTO partners_json (id, organizationName, data, rowOrder, createdAt) VALUES (?, ?, ?, ?, ?)')
          .run(p.id, p.organizationName, JSON.stringify(p), index, p.createdAt);
      });
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
};

module.exports = {
  addProjectPartner,
  backupFile,
  countPartners,
  createMessage,
  createOption,
  createPartner,
  createProject,
  createTag,
  createUser,
  dbPath,
  deleteOption,
  deletePartner,
  deleteProject,
  deleteTag,
  deleteUser,
  ensureSchema,
  fetchReactionsForMessages,
  getProject,
  getSession,
  getStorageName,
  getUserRole,
  setUserRole,
  createNotification,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  listProjectTemplates,
  listRepresentations,
  createRepresentation,
  updateRepresentation,
  deleteRepresentation,
  listFinanceEntries,
  createFinanceEntry,
  updateFinanceEntry,
  deleteFinanceEntry,
  summarizeFinance,
  summarizeFinancePerPartner,
  cloneProjectFromTemplate,
  listConversation,
  listInbox,
  listMessages,
  listOptions,
  listProjects,
  listProjectsForPartner,
  listTags,
  listUsers,
  login,
  logout,
  markMessagesRead,
  migrateLegacyFiles,
  readAllPartners,
  readMessage,
  readPartner,
  readSettings,
  recentFailedLoginCount,
  recordLoginAttempt,
  removeProjectPartner,
  replaceAllPartners,
  toggleReaction,
  unreadMessageCount,
  updatePartner,
  updateProject,
  upgradeUserToBcrypt,
  writeSettings,
};
