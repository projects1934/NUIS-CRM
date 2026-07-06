const { DatabaseSync } = require('node:sqlite');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for migration.');
  process.exit(1);
}

const sqlitePath = path.join(__dirname, 'private', 'partners.sqlite');
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const pgDb = require('./db');

const readSqlitePartners = () => {
  const hasJsonTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partners_json'").get();
  if (hasJsonTable) {
    return sqlite.prepare('SELECT data FROM partners_json ORDER BY rowOrder ASC, createdAt DESC')
      .all()
      .map((row) => JSON.parse(row.data));
  }

  const rows = sqlite.prepare('SELECT * FROM partners ORDER BY rowOrder ASC, createdAt DESC').all();
  return rows.map((row) => {
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
    return partner;
  });
};

(async () => {
  const partners = readSqlitePartners();
  await pgDb.ensureSchema();
  await pgDb.replaceAllPartners(partners);
  console.log(`Migrated ${partners.length} partners to Postgres.`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
