// סקריפט שרץ ב-GitHub Actions כל כמה דקות:
// 1. שולח תזכורת (התראת דחיפה) על כל משימה שהגיע זמן התזכורת שלה.
// 2. פעם ביום, בשעת הבוקר שנקבעה בהגדרות, שולח סיכום של משימות היום —
//    התראה לטלפון, וגם מייל לג'ימייל (אם הוגדרו הסודות GMAIL_USER ו-GMAIL_APP_PASSWORD).
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

function addDaysStr(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// "היום ב-14:00" / "מחר" / "ב-25.7" — מתי המשימה, יחסית להיום בישראל
function whenText(t, ilDate) {
  if (!t.due) return 'תזכורת למשימה';
  const time = t.time ? ` בשעה ${t.time}` : '';
  if (t.due === ilDate) return 'היום' + time;
  if (t.due === addDaysStr(ilDate, 1)) return 'מחר' + time;
  if (t.due < ilDate) return 'המועד עבר — כדאי לטפל';
  const [y, m, d] = t.due.split('-').map(Number);
  return `ב-${d}.${m}` + time;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtShortDate(due) { const [, m, d] = due.split('-').map(Number); return `${d}.${m}`; }

// גוף המייל של סיכום הבוקר — HTML פשוט בעברית, מימין לשמאל
function emailHtml(todays, ilDate) {
  const overdue = todays.filter(t => t.due < ilDate);
  const today = todays.filter(t => t.due === ilDate);
  const li = t => `<li style="margin:8px 0;font-size:16px">` +
    (t.time ? `<b>${t.time}</b> · ` : '') + escHtml(t.title) +
    (t.due < ilDate ? ` <span style="color:#c0392b">(מ-${fmtShortDate(t.due)})</span>` : '') + `</li>`;
  let body = '';
  if (!todays.length) {
    body = '<p style="font-size:17px">אין משימות להיום — יום חופשי 🎉</p>';
  } else {
    if (overdue.length) body += `<h3 style="color:#c0392b;margin:16px 0 4px">באיחור</h3><ul style="padding-inline-start:20px;margin:0">${overdue.map(li).join('')}</ul>`;
    if (today.length) body += `<h3 style="margin:16px 0 4px">היום</h3><ul style="padding-inline-start:20px;margin:0">${today.map(li).join('')}</ul>`;
  }
  return `<div dir="rtl" lang="he" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#2d2a3e">
    <h2 style="margin-bottom:4px">☀️ בוקר טוב!</h2>${body}
    <p style="margin-top:20px"><a href="https://pazitp.github.io/my-tasks/" style="color:#6c5ce7">לפתיחת האפליקציה</a></p>
  </div>`;
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
  // לכל משימה יכולות להיות כמה תזכורות (remindAts). שולחים כל תזכורת שעבר זמנה
  // ושעדיין לא נשלחה (חדשה מ-notifiedAt), ומדלגים על תזכורות ישנות מ-3 ימים.
  for (const t of tasks) {
    // רשימת מועדי התזכורת; אם היא ריקה — נופלים חזרה לשדה הישן remindAt (משימות מגרסה קודמת)
    const remindAts = (Array.isArray(t.remindAts) && t.remindAts.length) ? t.remindAts
      : (t.remindAt ? [t.remindAt] : []);
    const pending = remindAts.filter(ms =>
      ms <= now && ms > (t.notifiedAt || 0) && ms > now - 3 * 86400000);
    if (!pending.length) continue;
    console.log('תזכורת:', t.title);
    await push(tokens, {
      title: '⏰ ' + t.title,
      body: whenText(t, il.date) + (t.notes ? '\n' + String(t.notes).slice(0, 80) : ''),
      tag: 'task-' + t.id,
      taskId: t.id,
      url: './'
    });
    await db.doc('tasks/' + t.id).update({ notifiedAt: now });
  }

  // --- סיכום בוקר יומי ---
  const settingsRef = db.doc('taskMeta/settings');
  const sDoc = await settingsRef.get();
  const s = sDoc.exists ? sDoc.data() : {};
  const summaryHour = s.summaryHour || '07:00';
  const summaryTime = il.time >= summaryHour;
  const todays = tasks.filter(t => t.due && t.due <= il.date)
    .sort((a, b) => (a.due + (a.time || '99')).localeCompare(b.due + (b.time || '99')));
  const overdue = todays.filter(t => t.due < il.date).length;

  if (s.summaryEnabled !== false && summaryTime && s.summarySentDate !== il.date) {
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

  // --- מייל בוקר יומי ---
  // נשלח פעם ביום באותה שעה של סיכום הבוקר, אל כתובת הג'ימייל שבסוד GMAIL_USER.
  if (s.emailSummaryEnabled !== false && summaryTime && s.emailSentDate !== il.date) {
    const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      console.log('מייל בוקר: הסודות GMAIL_USER / GMAIL_APP_PASSWORD לא הוגדרו — מדלגים.');
    } else {
      let nodemailer = null;
      try { nodemailer = require('nodemailer'); }
      catch { console.log('מייל בוקר: חבילת nodemailer לא מותקנת — מדלגים.'); }
      if (nodemailer) {
        const subject = todays.length
          ? `☀️ ${todays.length} משימות להיום` + (overdue ? ` (${overdue} באיחור)` : '')
          : '☀️ אין משימות להיום 🎉';
        try {
          const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
          await transport.sendMail({
            from: `"המשימות שלי" <${user}>`,
            to: user,
            subject,
            html: emailHtml(todays, il.date)
          });
          await settingsRef.set({ emailSentDate: il.date }, { merge: true });
          console.log('מייל בוקר נשלח:', subject);
        } catch (e) {
          console.error('שליחת מייל הבוקר נכשלה:', e.message);
        }
      }
    }
  }

  console.log('סיום תקין.');
}

main().catch(e => { console.error(e); process.exit(1); });
