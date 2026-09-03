// מוסיף משימה למסד הנתונים — מופעל ידנית דרך GitHub Actions (add-task.yml).
// כך אפשר לבקש מקלוד להוסיף משימות ישירות לאפליקציה.
const admin = require('firebase-admin');

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error('חסר הסוד FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();

const LIST_COLORS = ['#6c5ce7', '#e05c5c', '#f0a13c', '#27ae60', '#4a90d9', '#f8c8dc', '#16a2b8', '#8a6d4b'];

// חותמת זמן של תאריך+שעה לפי שעון ישראל (הסביבה כאן רצה ב-UTC)
function ilEpoch(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  let ts = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(ts));
    const g = t => Number(parts.find(p => p.type === t).value);
    ts -= Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Date.UTC(y, mo - 1, d, h, mi);
  }
  return ts;
}

async function main() {
  const title = (process.env.TASK_TITLE || '').trim();
  if (!title) { console.error('חסרה כותרת משימה (TASK_TITLE)'); process.exit(1); }

  const due = (process.env.TASK_DUE || '').trim() || null;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) { console.error('תאריך לא תקין — הפורמט הוא YYYY-MM-DD'); process.exit(1); }
  const time = (process.env.TASK_TIME || '').trim() || null;
  if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) { console.error('שעה לא תקינה — הפורמט הוא HH:MM'); process.exit(1); }
  if (time && !due) { console.error('שעה בלי תאריך — צריך גם תאריך'); process.exit(1); }
  const notes = (process.env.TASK_NOTES || '').trim();
  const priority = Math.min(3, Math.max(0, parseInt(process.env.TASK_PRIORITY || '0', 10) || 0));
  const listName = (process.env.TASK_LIST || '').trim();

  // רשימה — לפי שם; נוצרת אם לא קיימת
  let listId = null;
  if (listName) {
    const snap = await db.collection('taskLists').get();
    const found = snap.docs.find(x => (x.data().name || '') === listName);
    if (found) listId = found.id;
    else {
      const ref = await db.collection('taskLists').add({
        name: listName,
        color: LIST_COLORS[snap.size % LIST_COLORS.length],
        order: snap.size
      });
      listId = ref.id;
      console.log('נוצרה רשימה חדשה:', listName);
    }
  }

  const reminders = (due && time) ? [{ daysBefore: 0, time }] : [];
  const task = {
    title, notes, listId, listIds: listId ? [listId] : [], priority,
    due, time,
    repeat: null,
    reminders,
    remindAts: (due && time) ? [ilEpoch(due, time)] : [],
    notifiedAt: null,
    done: false, completedAt: null, createdAt: Date.now()
  };
  const ref = await db.collection('tasks').add(task);
  console.log(`✔ נוספה משימה: "${title}"` +
    (due ? ` | תאריך: ${due}` : '') + (time ? ` ${time}` : '') +
    (listName ? ` | רשימה: ${listName}` : '') + ` | מזהה: ${ref.id}`);
}

main().catch(e => { console.error(e); process.exit(1); });
