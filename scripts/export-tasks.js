// מייצא את המשימות הפתוחות (ואת אלה שהושלמו בשבוע האחרון) לקובץ JSON.
// רץ ב-GitHub Actions (export-tasks.yml) ומועתק למאגר הפרטי my-tasks-data,
// כדי שקלוד יוכל לקרוא את המשימות דרך מחבר GitHub בלי כניסה לאפליקציה.
// קריאה בלבד — הסקריפט לא משנה שום דבר במסד הנתונים.
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error('חסר הסוד FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();

const OUT = process.env.EXPORT_PATH || path.join(__dirname, '..', 'data', 'tasks.json');
const DONE_DAYS = 7;

function ilParts(ms, withTime) {
  const opts = { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(new Date(ms));
  return t => parts.find(p => p.type === t).value;
}
function ilDate(ms) { const g = ilParts(ms, false); return `${g('year')}-${g('month')}-${g('day')}`; }
function ilDateTime(ms) {
  if (!ms) return null;
  const g = ilParts(ms, true);
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

async function main() {
  const listsSnap = await db.collection('taskLists').get();
  const lists = listsSnap.docs
    .map(d => ({ id: d.id, name: d.data().name || '', order: d.data().order ?? 0 }))
    .sort((a, b) => a.order - b.order);
  const listName = id => (lists.find(l => l.id === id) || {}).name || null;

  const snap = await db.collection('tasks').get();
  const now = Date.now();
  const today = ilDate(now);
  const cutoff = now - DONE_DAYS * 86400000;

  // שדות יציבים בלבד (בלי notifiedAt/remindAts שמשתנים כל הזמן),
  // כדי שהקובץ ישתנה רק כשהמשימות עצמן משתנות
  const slim = t => ({
    id: t.id,
    title: t.title || '',
    notes: t.notes || '',
    lists: (Array.isArray(t.listIds) && t.listIds.length ? t.listIds : (t.listId ? [t.listId] : []))
      .map(listName).filter(Boolean),
    priority: t.priority || 0,
    due: t.due || null,
    time: t.time || null,
    repeat: t.repeat || null,
    overdue: !!(t.due && t.due < today && !t.done),
    createdAt: ilDateTime(t.createdAt),
    completedAt: ilDateTime(t.completedAt)
  });

  // רשימת הקניות (taskMeta/shopping) — פריטים חופשיים, bought = סומן ב-V
  const shopSnap = await db.collection('taskMeta').doc('shopping').get();
  const shopping = ((shopSnap.exists && shopSnap.data().items) || [])
    .map(it => ({ text: (it.text || '').trim(), bought: !!it.bought }))
    .filter(it => it.text);

  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sortKey = t => (t.due || '9999') + (t.time || '99:99') + (t.title || '');
  const open = all.filter(t => !t.done).map(slim).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const doneRecent = all.filter(t => t.done && (t.completedAt || 0) >= cutoff).map(slim)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const out = {
    _readme: 'ייצוא אוטומטי מאפליקציית המשימות. תאריכים ושעות לפי שעון ישראל. ' +
      'open = משימות פתוחות (ממוינות לפי תאריך ושעה), doneRecent = הושלמו ב-7 הימים האחרונים, ' +
      'shopping = רשימת הקניות (bought=true אם סומן ב-V). ' +
      'קריאה בלבד — כדי להוסיף משימה פותחים issue במאגר my-tasks עם הקידומת "משימה:", ' +
      'וכדי לסמן פריטי קניות כנקנו פותחים issue עם הקידומת "נקנה:".',
    lists: lists.map(l => l.name),
    counts: {
      open: open.length,
      overdue: open.filter(t => t.overdue).length,
      dueToday: open.filter(t => t.due === today).length
    },
    open,
    doneRecent,
    shopping
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`✔ יוצאו ${open.length} משימות פתוחות, ${doneRecent.length} שהושלמו לאחרונה ו-${shopping.length} פריטי קניות אל ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
