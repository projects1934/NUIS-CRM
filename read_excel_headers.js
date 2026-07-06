const xlsx = require('xlsx');
const path = require('path');

const files = ['עדכני 2026.xlsx', 'דצמבר 2025.xlsx', 'ישן 2022-2024.xlsx'];
const baseDir = path.join(__dirname, '..');

files.forEach((file) => {
  console.log(`\n--- Reading ${file} ---`);
  try {
    const workbook = xlsx.readFile(path.join(baseDir, file));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log('Headers:', data[0] || []);
    console.log('First row:', data[1] || []);
  } catch (error) {
    console.error(`Error reading ${file}:`, error.message);
  }
});
