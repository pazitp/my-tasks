// מסמן פריטים ברשימת הקניות (taskMeta/shopping) כ"נקנו" — מופעל דרך issue
// שכותרתו מתחילה ב-"נקנה:" (ראו mark-bought.yml). לא מוחק פריטים: המחיקה
// הסופית נעשית באפליקציה אחרי שהמשלוח הגיע.
// קלט: ISSUE_TITLE ו-ISSUE_BODY מהסביבה. הפריטים מופרדים בפסיקים או בשורות.
// פלט: RESULT_COMMENT אל $GITHUB_ENV (תגובה ל-issue).
const fs = require('fs');
const crypto = require('crypto');
const admin = require('firebase-admin');

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error('חסר הסוד FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();

const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function parseItems() {
  const title = (process.env.ISSUE_TITLE || '').replace(/^נקנה:\s*/u, '');
  const body = process.env.ISSUE_BODY || '';
  return [title, ...body.split(/\r?\n/)]
    .flatMap(line => line.split(','))
    .map(s => s.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

async function main() {
  const wanted = parseItems();
  if (!wanted.length) { console.error('לא צוינו פריטים לסימון'); process.exit(1); }

  const ref = db.collection('taskMeta').doc('shopping');
  const snap = await ref.get();
  const items = (snap.exists && snap.data().items) || [];

  const marked = [], already = [], notFound = [];
  for (const w of wanted) {
    const nw = norm(w);
    // התאמה מדויקת, ואם אין — פריט יחיד שמכיל את הטקסט
    let idx = items.findIndex(it => norm(it.text) === nw);
    if (idx < 0) {
      const cands = items.map((it, i) => (norm(it.text).includes(nw) ? i : -1)).filter(i => i >= 0);
      if (cands.length === 1) idx = cands[0];
    }
    if (idx < 0) { notFound.push(w); continue; }
    if (items[idx].bought) { already.push(items[idx].text); continue; }
    items[idx] = { ...items[idx], bought: true };
    marked.push(items[idx].text);
  }

  if (marked.length) await ref.set({ items });

  const lines = [];
  if (marked.length) lines.push('✔ סומנו כנקנו: ' + marked.join(', '));
  if (already.length) lines.push('ℹ כבר היו מסומנים: ' + already.join(', '));
  if (notFound.length) lines.push('✖ לא נמצאו ברשימה: ' + notFound.join(', '));
  const comment = lines.join('\n');
  console.log(comment);

  const envFile = process.env.GITHUB_ENV;
  if (envFile) {
    const delim = 'EOF_' + crypto.randomBytes(8).toString('hex');
    fs.appendFileSync(envFile, ['RESULT_COMMENT<<' + delim, comment, delim, ''].join('\n'));
  }
  if (!marked.length && notFound.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
