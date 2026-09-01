// מפרק issue שנפתח (ראו add-task.yml) למשתני סביבה עבור add-task.js.
// קלט: ISSUE_TITLE ו-ISSUE_BODY מהסביבה. פלט: משתני ISSUE_TASK_* אל $GITHUB_ENV.
const fs = require('fs');
const crypto = require('crypto');

const title = (process.env.ISSUE_TITLE || '').trim();
const body = process.env.ISSUE_BODY || '';

// הסרת הקידומת "משימה:" מהכותרת
const taskTitle = title.replace(/^משימה:\s*/u, '').trim();
if (!taskTitle) { console.error('כותרת המשימה ריקה אחרי הסרת הקידומת "משימה:"'); process.exit(1); }

// שורות `מפתח: ערך` בגוף — מפתחות באנגלית או בעברית
const KEY_MAP = {
  due: 'DUE', 'תאריך': 'DUE',
  time: 'TIME', 'שעה': 'TIME',
  list: 'LIST', 'רשימה': 'LIST',
  priority: 'PRIORITY', 'עדיפות': 'PRIORITY',
  notes: 'NOTES', 'הערות': 'NOTES',
};

const values = { DUE: '', TIME: '', LIST: '', PRIORITY: '', NOTES: '' };
for (const line of body.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z\u0590-\u05FF]+)\s*:\s*(.*)$/u);
  if (!m) continue;
  const key = KEY_MAP[m[1].toLowerCase()];
  if (key) values[key] = m[2].trim();
}

// כתיבה ל-$GITHUB_ENV בפורמט heredoc (בטוח גם לערכים עם תווים מיוחדים)
const lines = [];
function emit(name, value) {
  const delim = 'EOF_' + crypto.randomBytes(8).toString('hex');
  lines.push(name + '<<' + delim, value, delim);
}
emit('ISSUE_TASK_TITLE', taskTitle);
emit('ISSUE_TASK_DUE', values.DUE);
emit('ISSUE_TASK_TIME', values.TIME);
emit('ISSUE_TASK_LIST', values.LIST);
emit('ISSUE_TASK_PRIORITY', values.PRIORITY);
emit('ISSUE_TASK_NOTES', values.NOTES);

const envFile = process.env.GITHUB_ENV;
if (!envFile) { console.error('חסר משתנה הסביבה GITHUB_ENV'); process.exit(1); }
fs.appendFileSync(envFile, lines.join('\n') + '\n');

console.log('כותרת:', taskTitle);
for (const [k, v] of Object.entries(values)) if (v) console.log(k + ': ' + v);
