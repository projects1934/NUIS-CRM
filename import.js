const xlsx = require('xlsx');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { backupFile, replaceAllPartners } = require('./db');

const baseDir = path.join(__dirname, '..');
const legacyDataPath = path.join(__dirname, 'data.json');

const organizations = new Map();

const norm = (value) => (value == null ? '' : String(value).trim());
const fuzzyMatchKey = (value) => norm(value).toLowerCase().replace(/[\s"'\-–—]/g, '');

const appendUniqueNote = (current, note) => {
  const cleanNote = norm(note);
  if (!cleanNote) return current || '';
  if (!current) return cleanNote;
  return current.includes(cleanNote) ? current : `${current} | ${cleanNote}`;
};

const getOrg = (name, sourceFileName, defaultDate) => {
  const organizationName = norm(name);
  if (!organizationName) return null;

  const fuzzyName = fuzzyMatchKey(organizationName);
  for (const [key, org] of organizations.entries()) {
    if (fuzzyMatchKey(key) === fuzzyName) {
      if (!org.sourceFiles.includes(sourceFileName)) org.sourceFiles.push(sourceFileName);
      return org;
    }
  }

  const org = {
    id: uuidv4(),
    organizationName,
    domain: '',
    status: 'initial',
    priority: '',
    sponsorshipCategory: '',
    estimatedAmount: '',
    packageDescription: '',
    pic: '',
    contacts: [],
    communicationLog: [],
    generalNotes: '',
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    sourceFiles: [sourceFileName],
    contactDate: defaultDate,
    partnerType: '',
  };

  organizations.set(organizationName, org);
  return org;
};

const addContact = (org, contactData, dataSource = '') => {
  const name = norm(contactData.name);
  if (!name) return;

  const key = `${name}|${norm(contactData.email)}|${norm(contactData.phone)}`.toLowerCase();
  const existing = org.contacts.find((contact) => (
    `${contact.name}|${contact.email}|${contact.phone}`.toLowerCase() === key
  ));
  if (existing) {
    if (dataSource && !existing.dataSource) existing.dataSource = dataSource;
    return;
  }

  org.contacts.push({
    id: uuidv4(),
    name,
    role: norm(contactData.role),
    phone: norm(contactData.phone),
    email: norm(contactData.email),
    dataSource,
  });
};

const readRows = (fileName, options = {}) => {
  const workbook = xlsx.readFile(path.join(baseDir, fileName));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, options);
};

const importCurrent2026 = () => {
  const rows = readRows('עדכני 2026.xlsx');
  rows.forEach((row, index) => {
    const org = getOrg(row['ארגון'], '2026', '2026-01-01');
    if (!org) return;

    org.createdAt = new Date(Date.now() - index * 1000).toISOString();
    if (row['מה על הפרק?']) org.packageDescription = norm(row['מה על הפרק?']);
    if (row['הערות/על מה לדבר']) org.generalNotes = appendUniqueNote(org.generalNotes, row['הערות/על מה לדבר']);
    if (row['אחריות פנימית']) org.pic = norm(row['אחריות פנימית']);

    addContact(org, {
      name: row['שם איש קשר'],
      role: row['תפקיד'],
      phone: row['טלפון'],
      email: row['מייל'],
    }, '2026');
  });
};

const importDecember2025 = () => {
  const rows = readRows('דצמבר 2025.xlsx');
  rows.forEach((row, index) => {
    const org = getOrg(row['ארגון'], '2025', '2025-01-01');
    if (!org) return;

    if (!org.pic && row['אחריות פנימית']) org.pic = norm(row['אחריות פנימית']);
    if (!org.createdAt) org.createdAt = new Date(Date.now() - (100000 + index * 1000)).toISOString();
    org.generalNotes = appendUniqueNote(org.generalNotes, row['הערות']);
    if (row['חברות בבורד / פורום נוסף']) {
      org.generalNotes = appendUniqueNote(org.generalNotes, `חברות בבורד: ${norm(row['חברות בבורד / פורום נוסף'])}`);
    }

    addContact(org, {
      name: row['שם איש קשר'],
      role: row['תפקיד'],
      phone: row['טלפון'],
      email: row['מייל'],
    }, '2025');
  });
};

const importOld2022To2024 = () => {
  const rows = readRows('ישן 2022-2024.xlsx', { range: 1 });
  rows.forEach((row, index) => {
    const org = getOrg(row['הארגון'], 'ישן', '2022-01-01');
    if (!org) return;

    if (!org.packageDescription && row['מהות שיתוף הפעולה']) {
      org.packageDescription = norm(row['מהות שיתוף הפעולה']);
    }
    if (!org.pic && row['איש/ת קשר בהתאחדות']) org.pic = norm(row['איש/ת קשר בהתאחדות']);
    if (!org.createdAt) org.createdAt = new Date(Date.now() - (200000 + index * 1000)).toISOString();

    addContact(org, {
      name: row['אנשי הקשר'],
      role: row['תפקיד'],
      phone: '',
      email: row['מיילים'],
    }, '2022-2024');
  });
};

(async () => {
  backupFile(legacyDataPath, 'data-before-excel-import');
  importCurrent2026();
  importDecember2025();
  importOld2022To2024();

  const finalData = Array.from(organizations.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  await replaceAllPartners(finalData);
  console.log(`Imported ${finalData.length} organizations into configured storage.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
