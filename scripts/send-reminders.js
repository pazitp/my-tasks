// סקריפט שרץ ב-GitHub Actions כל 10 דקות:
// 1. שולח תזכורת (התראת דחיפה) על כל משימה שהגיע זמן התזכורת שלה.
// 2. פעם ביום, בשעת הבוקר שנקבעה בהגדרות, שולח סיכום של משימות היום.
const admin = require('firebase-admin');

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error('חסר הסוד FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();

// תאריך ושעה נוכחיים לפי שעון ישראל
function ilNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

function fmtTime(ms) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(ms));
}

async function getTokens() {
  const doc = await db.doc('taskMeta/tokens').get();
  const map = (doc.exists && doc.data().devices) || {};
  return Object.entries(map).map(([id, v]) => ({ id, token: v.token }));
}

// שולח הודעה לכל המכשירים ומנקה מכשירים שכבר לא רשומים
async function push(tokens, data) {
  if (!tokens.length) return;
  const res = await admin.messaging().sendEachForMulticast({
    tokens: tokens.map(t => t.token),
    data,
    webpush: { headers: { Urgency: 'high', TTL: '86400' } }
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      console.error('שליחה נכשלה:', code);
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        dead.push(tokens[i].id);
      }
    }
  });
  if (dead.length) {
    const updates = {};
    dead.forEach(id => { updates[`devices.${id}`] = admin.firestore.FieldValue.delete(); });
    await db.doc('taskMeta/tokens').update(updates).catch(() => {});
  }
}

async function main() {
  const tokens = await getTokens();
  if (!tokens.length) { console.log('אין מכשירים רשומים להתראות — אין מה לשלוח.'); return; }

  const now = Date.now();
  const il = ilNow();
  const snap = await db.collection('tasks').where('done', '==', false).get();
  const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // --- תזכורות למשימות שהגיע זמנן ---
  for (const t of tasks) {
    if (!t.remindAt || t.remindAt > now) continue;
    if (t.notifiedAt && t.notifiedAt >= t.remindAt) continue; // כבר נשלחה
    console.log('תזכורת:', t.title);
    await push(tokens, {
      title: '⏰ ' + t.title,
      body: t.time ? `היום בשעה ${t.time}` : (t.notes ? String(t.notes).slice(0, 100) : 'תזכורת למשימה'),
      tag: 'task-' + t.id,
      url: './'
    });
    await db.doc('tasks/' + t.id).update({ notifiedAt: now });
  }

  // --- סיכום בוקר יומי ---
  const settingsRef = db.doc('taskMeta/settings');
  const sDoc = await settingsRef.get();
  const s = sDoc.exists ? sDoc.data() : {};
  const summaryHour = s.summaryHour || '07:00';
  if (s.summaryEnabled !== false && il.time >= summaryHour && s.summarySentDate !== il.date) {
    const todays = tasks.filter(t => t.due && t.due <= il.date)
      .sort((a, b) => (a.due + (a.time || '99')).localeCompare(b.due + (b.time || '99')));
    const overdue = todays.filter(t => t.due < il.date).length;
    let title, body;
    if (!todays.length) {
      title = '☀️ בוקר טוב!';
      body = 'אין משימות להיום — יום חופשי 🎉';
    } else {
      title = `☀️ בוקר טוב! ${todays.length} משימות להיום` + (overdue ? ` (${overdue} באיחור)` : '');
      body = todays.slice(0, 6).map(t => '• ' + (t.time ? t.time + ' ' : '') + t.title).join('\n');
      if (todays.length > 6) body += `\n...ועוד ${todays.length - 6}`;
    }
    console.log('סיכום בוקר:', title);
    await push(tokens, { title, body, tag: 'daily-summary', url: './' });
    await settingsRef.set({ summarySentDate: il.date }, { merge: true });
  }

  console.log('סיום תקין.');
}

main().catch(e => { console.error(e); process.exit(1); });
