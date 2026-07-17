// ===================================================================
//  המשימות שלי — אפליקציית משימות ותזכורות
//  מבנה הקובץ:
//   1. עזרי תאריכים
//   2. מנוע חזרות (משימות חוזרות)
//   3. הבנת טקסט חופשי בעברית (Smart Add)
//   4. שמירת נתונים (מקומי / Firebase)
//   5. ממשק המשתמש
//   6. התראות דחיפה
//   7. כניסה ואתחול
// ===================================================================

// ===== 1. עזרי תאריכים =====
// תאריכים נשמרים כמחרוזת 'YYYY-MM-DD' ושעות כ-'HH:MM' — פשוט ואמין.

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function pad(n) { return String(n).padStart(2, '0'); }

function dateToStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function strToDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

function todayStr() { return dateToStr(new Date()); }

function addDaysStr(s, n) { const d = strToDate(s); d.setDate(d.getDate() + n); return dateToStr(d); }

function addMonthsStr(s, n, dayOfMonth) {
  const d = strToDate(s);
  const day = dayOfMonth || d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dateToStr(d);
}

function dayOfWeek(s) { return strToDate(s).getDay(); }

function lastDayOfMonthStr(s) {
  const d = strToDate(s);
  return dateToStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

// "יום ראשון ה-N של החודש" — nth = 1..4, או -1 = האחרון
function nthWeekdayOfMonth(year, month, nth, weekday) {
  if (nth === -1) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    last.setDate(last.getDate() - diff);
    return dateToStr(last);
  }
  const first = new Date(year, month, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  first.setDate(1 + diff + (nth - 1) * 7);
  if (first.getMonth() !== month) return null; // אין "יום חמישי חמישי" בחודש הזה
  return dateToStr(first);
}

// תיאור ידידותי של תאריך יעד
function fmtDueLabel(due) {
  const t = todayStr();
  if (due === t) return 'היום';
  if (due === addDaysStr(t, 1)) return 'מחר';
  if (due === addDaysStr(t, -1)) return 'אתמול';
  const d = strToDate(due);
  const short = `${d.getDate()}.${d.getMonth() + 1}`;
  const withYear = d.getFullYear() !== new Date().getFullYear() ? `${short}.${d.getFullYear()}` : short;
  if (due > t && due <= addDaysStr(t, 6)) return `יום ${DAY_NAMES[d.getDay()]}, ${withYear}`;
  return `${withYear} (יום ${DAY_NAMES[d.getDay()]})`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 2. מנוע חזרות =====
// מבנה חוקיות:
// { mode:'schedule'|'after', unit:'day'|'week'|'month'|'year', interval:1,
//   weekdays:[0..6],                      // לשבועי
//   monthMode:'day'|'nth', monthDay:15,   // לחודשי לפי תאריך
//   nthWeek:1..4|-1, nthDay:0..6 }        // לחודשי לפי "יום X ה-N"

function repeatStep(rep, from) {
  const iv = rep.interval || 1;
  switch (rep.unit) {
    case 'day': return addDaysStr(from, iv);
    case 'week': {
      const days = (rep.weekdays && rep.weekdays.length) ? [...rep.weekdays].sort() : [dayOfWeek(from)];
      const w = dayOfWeek(from);
      const nextInWeek = days.find(d => d > w);
      if (nextInWeek !== undefined) return addDaysStr(from, nextInWeek - w);
      return addDaysStr(from, 7 * iv - w + days[0]);
    }
    case 'month': {
      if (rep.monthMode === 'nth') {
        const d = strToDate(from);
        let y = d.getFullYear(), m = d.getMonth() + iv;
        let r = null, guard = 0;
        while (!r && guard++ < 24) {
          y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
          r = nthWeekdayOfMonth(y, m, rep.nthWeek, rep.nthDay);
          if (!r) m += iv;
        }
        return r || addMonthsStr(from, iv);
      }
      return addMonthsStr(from, iv, rep.monthDay || strToDate(from).getDate());
    }
    case 'year': return addMonthsStr(from, 12 * iv);
    default: return addDaysStr(from, 1);
  }
}

// התאריך הבא של משימה חוזרת, אחרי שסומנה כהושלמה
function computeNextDue(rep, curDue) {
  const t = todayStr();
  if (rep.mode === 'after') {
    // נספר מהיום שבו הושלמה בפועל
    const unitDays = { day: 1, week: 7 };
    if (rep.unit === 'month') return addMonthsStr(t, rep.interval || 1);
    if (rep.unit === 'year') return addMonthsStr(t, 12 * (rep.interval || 1));
    return addDaysStr(t, (rep.interval || 1) * unitDays[rep.unit || 'day']);
  }
  let d = curDue || firstDueForRepeat(rep);
  let guard = 0;
  do { d = repeatStep(rep, d); } while (d <= t && guard++ < 1000);
  return d;
}

// תאריך התחלה הגיוני למשימה חוזרת חדשה שלא צוין לה תאריך
function firstDueForRepeat(rep) {
  const t = todayStr();
  if (rep.mode === 'after') return computeNextDue(rep, null);
  switch (rep.unit) {
    case 'week': {
      if (rep.weekdays && rep.weekdays.length) {
        const w = dayOfWeek(t);
        const days = [...rep.weekdays].sort();
        const next = days.find(d => d >= w);
        return next !== undefined ? addDaysStr(t, next - w) : addDaysStr(t, 7 - w + days[0]);
      }
      return t;
    }
    case 'month': {
      const d = strToDate(t);
      if (rep.monthMode === 'nth') {
        const r = nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), rep.nthWeek, rep.nthDay);
        return (r && r >= t) ? r : repeatStep(rep, t);
      }
      if (!rep.monthDay) return t; // "כל חודשיים" בלי תאריך מסוים — מתחילים מהיום
      const day = rep.monthDay;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const thisMonth = dateToStr(new Date(d.getFullYear(), d.getMonth(), Math.min(day, last)));
      return thisMonth >= t ? thisMonth : addMonthsStr(thisMonth, 1, day);
    }
    default: return t;
  }
}

const NTH_WORDS = { 1: 'הראשון', 2: 'השני', 3: 'השלישי', 4: 'הרביעי', '-1': 'האחרון' };

function hebCount(n, one, two, many) { return n === 1 ? one : n === 2 ? two : `${n} ${many}`; }

// תיאור ידידותי של חוקיות החזרה
function describeRepeat(rep) {
  if (!rep) return '';
  const iv = rep.interval || 1;
  if (rep.mode === 'after') {
    const u = { day: ['יום', 'יומיים', 'ימים'], week: ['שבוע', 'שבועיים', 'שבועות'], month: ['חודש', 'חודשיים', 'חודשים'], year: ['שנה', 'שנתיים', 'שנים'] }[rep.unit || 'day'];
    return hebCount(iv, u[0], u[1], u[2]) + ' אחרי סיום';
  }
  switch (rep.unit) {
    case 'day': return iv === 1 ? 'כל יום' : iv === 2 ? 'כל יומיים' : `כל ${iv} ימים`;
    case 'week': {
      const base = iv === 1 ? 'כל שבוע' : iv === 2 ? 'כל שבועיים' : `כל ${iv} שבועות`;
      if (rep.weekdays && rep.weekdays.length) {
        const names = rep.weekdays.map(d => DAY_NAMES[d]);
        const joined = names.length > 1 ? names.slice(0, -1).join(', ') + ' ו' + names[names.length - 1] : names[0];
        return `${base} ביום ${joined}`;
      }
      return base;
    }
    case 'month': {
      const base = iv === 1 ? 'כל חודש' : iv === 2 ? 'כל חודשיים' : `כל ${iv} חודשים`;
      if (rep.monthMode === 'nth') return `יום ${DAY_NAMES[rep.nthDay]} ${NTH_WORDS[rep.nthWeek]} — ${base}`;
      return rep.monthDay ? `${base} ב-${rep.monthDay}` : base;
    }
    case 'year': return iv === 1 ? 'כל שנה' : iv === 2 ? 'כל שנתיים' : `כל ${iv} שנים`;
  }
  return '';
}

// ===== 3. הבנת טקסט חופשי בעברית (Smart Add) =====

const DAY_WORDS = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
const COUNT_WORDS = {
  'יום': [1, 'day'], 'יומיים': [2, 'day'], 'שבוע': [1, 'week'], 'שבועיים': [2, 'week'],
  'חודש': [1, 'month'], 'חודשיים': [2, 'month'], 'שנה': [1, 'year'], 'שנתיים': [2, 'year']
};
const UNIT_WORDS = { 'ימים': 'day', 'שבועות': 'week', 'חודשים': 'month', 'שנים': 'year' };
// המילים הארוכות קודם — כדי ש"שבועיים" לא ייתפס בטעות כ"שבוע"
const COUNT_ALT = Object.keys(COUNT_WORDS).sort((a, b) => b.length - a.length).join('|');
const DAYS_ALT = 'ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת';

function parseSmartAdd(raw) {
  let text = ' ' + raw.trim() + ' ';
  const out = { title: '', due: null, time: null, repeat: null, listName: null, priority: 0 };

  function take(re, fn) {
    const m = text.match(re);
    if (m) { text = text.replace(re, ' '); fn(m); }
    return !!m;
  }

  // --- רשימה: #שם ---
  take(/#([^\s#!]+)/, m => { out.listName = m[1]; });

  // --- עדיפות: !1 / !גבוה ---
  take(/!([123])/, m => { out.priority = Number(m[1]); }) ||
    take(/!(גבוהה?|בינונית?|נמוכה?)/, m => {
      out.priority = m[1].startsWith('גבוה') ? 1 : m[1].startsWith('בינוני') ? 2 : 3;
    });

  // --- חזרה: "X אחרי סיום/שאסיים" ---
  take(new RegExp(`(?:(\\d+)\\s*(ימים|שבועות|חודשים|שנים)|(${COUNT_ALT}))\\s+(?:אחרי|לאחר)\\s+(?:ה)?(?:סיום|השלמה|שאסיים|שסיימתי|שאני מסיימת|סימון)(?:\\s+(?:של\\s+)?(?:המשימה|הקודמת|כהושלמה|כבוצעה))*`), m => {
    let interval, unit;
    if (m[1]) { interval = Number(m[1]); unit = UNIT_WORDS[m[2]]; }
    else { [interval, unit] = COUNT_WORDS[m[3]]; }
    out.repeat = { mode: 'after', unit, interval };
  });

  // --- חזרה: "יום ראשון האחרון של כל חודש" ---
  take(new RegExp(`(?:ב)?יום\\s+(${DAYS_ALT})\\s+ה(ראשון|שני|שלישי|רביעי|אחרון)\\s+(?:של|ב)?\\s*(?:כל\\s+)?(?:ה)?חודש`), m => {
    const nthMap = { 'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'אחרון': -1 };
    out.repeat = { mode: 'schedule', unit: 'month', interval: 1, monthMode: 'nth', nthWeek: nthMap[m[2]], nthDay: DAY_WORDS[m[1]] };
  });

  // --- חזרה: "כל חודש ב-5" / "ב-5 לכל חודש" / "כל 5 לחודש" ---
  if (!out.repeat) {
    take(/כל\s+חודש\s+ב[-\s]?(\d{1,2})(?!\d|[:.\/])/, m => {
      out.repeat = { mode: 'schedule', unit: 'month', interval: 1, monthMode: 'day', monthDay: Number(m[1]) };
    }) ||
    take(/(?:כל\s+|ב)[-]?(\d{1,2})\s+(?:ל|ב)(?:כל\s+)?(?:ה)?חודש/, m => {
      out.repeat = { mode: 'schedule', unit: 'month', interval: 1, monthMode: 'day', monthDay: Number(m[1]) };
    });
  }

  // --- חזרה: "כל יום ראשון ורביעי" ---
  if (!out.repeat) {
    take(new RegExp(`כל\\s+(?:יום\\s+|ימי\\s+)?(${DAYS_ALT})((?:\\s*(?:,\\s*|\\s+ו)(?:יום\\s+)?(?:${DAYS_ALT}))*)`), m => {
      const days = [DAY_WORDS[m[1]]];
      const more = m[2] || '';
      const re2 = new RegExp(DAYS_ALT, 'g');
      let mm; while ((mm = re2.exec(more))) days.push(DAY_WORDS[mm[0]]);
      out.repeat = { mode: 'schedule', unit: 'week', interval: 1, weekdays: [...new Set(days)].sort() };
    });
  }

  // --- חזרה: "כל יום / כל שבועיים / כל 3 חודשים" ---
  if (!out.repeat) {
    take(new RegExp(`כל\\s+(?:(\\d+)\\s*(ימים|שבועות|חודשים|שנים)|(${COUNT_ALT}))`), m => {
      let interval, unit;
      if (m[1]) { interval = Number(m[1]); unit = UNIT_WORDS[m[2]]; }
      else { [interval, unit] = COUNT_WORDS[m[3]]; }
      out.repeat = { mode: 'schedule', unit, interval };
    });
  }

  // --- תאריך יעד ---
  take(/מחרתיים/, () => { out.due = addDaysStr(todayStr(), 2); }) ||
  take(/מחר/, () => { out.due = addDaysStr(todayStr(), 1); }) ||
  take(/היום/, () => { out.due = todayStr(); }) ||
  take(/בסוף\s+החודש/, () => { out.due = lastDayOfMonthStr(todayStr()); }) ||
  take(new RegExp(`בעוד\\s+(?:(\\d+)\\s*(ימים|שבועות|חודשים|שנים)|(${COUNT_ALT}))`), m => {
    let n, unit;
    if (m[1]) { n = Number(m[1]); unit = UNIT_WORDS[m[2]]; }
    else { [n, unit] = COUNT_WORDS[m[3]]; }
    const days = { day: 1, week: 7 };
    out.due = unit === 'month' ? addMonthsStr(todayStr(), n)
      : unit === 'year' ? addMonthsStr(todayStr(), 12 * n)
      : addDaysStr(todayStr(), n * days[unit]);
  }) ||
  take(/(?:ב[-\s]?)?(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?(?!\d|:)/, m => {
    const now = new Date();
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && dateToStr(d) < todayStr()) d.setFullYear(d.getFullYear() + 1);
    out.due = dateToStr(d);
  }) ||
  take(new RegExp(`ב?יום\\s+(${DAYS_ALT})(?:\\s+(?:הקרוב|הבא))?`), m => {
    const w = DAY_WORDS[m[1]], today = dayOfWeek(todayStr());
    const diff = ((w - today + 7) % 7) || 7;
    out.due = addDaysStr(todayStr(), diff);
  }) ||
  take(/בשבת/, () => {
    const diff = ((6 - dayOfWeek(todayStr()) + 7) % 7) || 7;
    out.due = addDaysStr(todayStr(), diff);
  });

  // --- שעה ---
  take(/(?:בשעה\s+|ב[-\s]?)?([01]?\d|2[0-3]):([0-5]\d)/, m => { out.time = `${pad(Number(m[1]))}:${m[2]}`; }) ||
  take(/בבוקר/, () => { out.time = '09:00'; }) ||
  take(/בצהריים/, () => { out.time = '12:00'; }) ||
  take(/אחר(?:י)?\s+הצהריים|אחה"צ/, () => { out.time = '16:00'; }) ||
  take(/בערב/, () => { out.time = '19:00'; }) ||
  take(/בלילה/, () => { out.time = '21:00'; });

  // השלמות הגיוניות
  if (out.repeat && !out.due) out.due = firstDueForRepeat(out.repeat);
  if (out.time && !out.due) {
    const now = new Date();
    const passed = out.time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    out.due = passed ? addDaysStr(todayStr(), 1) : todayStr();
  }

  out.title = text.replace(/\s+/g, ' ').trim();
  return out;
}

// חישוב מועד התזכורת (במילישניות) מתאריך + שעת תזכורת
function computeRemindAt(due, remindTime) {
  if (!due) return null;
  const [h, m] = (remindTime || '09:00').split(':').map(Number);
  const d = strToDate(due);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// לכל משימה יכולות להיות כמה תזכורות: [{daysBefore: 0, time: '09:00'}, ...]
// מחשב מהן את מועדי השליחה בפועל עבור תאריך היעד הנוכחי.
function remindAtsFor(due, reminders) {
  if (!due || !reminders || !reminders.length) return [];
  const times = reminders
    .map(r => computeRemindAt(addDaysStr(due, -(r.daysBefore || 0)), r.time))
    .filter(Boolean);
  return [...new Set(times)].sort((a, b) => a - b);
}

// קורא את התזכורות של משימה, כולל תמיכה במבנה הישן (תזכורת אחת)
function getReminders(t) {
  if (Array.isArray(t.reminders)) return t.reminders;
  if (t.remind) return [{ daysBefore: 0, time: t.remindTime || t.time || '09:00' }];
  return [];
}

const REM_DAYS_OPTS = [[0, 'ביום המשימה'], [1, 'יום לפני'], [2, 'יומיים לפני'], [3, '3 ימים לפני'], [7, 'שבוע לפני'], [14, 'שבועיים לפני']];

// ===== 3ב. ייבוא מ-Remember the Milk =====
// קורא את קובץ הייצוא (JSON) של RTM וממיר את המשימות הפתוחות למבנה שלנו.

const RRULE_DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// ממיר חוקיות חזרה בפורמט RRULE (למשל "FREQ=MONTHLY;BYDAY=-1SU") למבנה שלנו.
// everyFlag=false פירושו ב-RTM חזרה של "אחרי סיום".
function repeatFromRRule(rrule, everyFlag) {
  if (!rrule) return null;
  const p = {};
  String(rrule).replace(/^RRULE:/i, '').split(';').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) p[k.trim().toUpperCase()] = (v || '').trim().toUpperCase();
  });
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[p.FREQ];
  if (!unit) return null;
  const interval = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);
  if (everyFlag === false || everyFlag === 0 || everyFlag === '0') return { mode: 'after', unit, interval };
  const rep = { mode: 'schedule', unit, interval };
  if (unit === 'week' && p.BYDAY) {
    const days = p.BYDAY.split(',').map(d => RRULE_DAYS[d.slice(-2)]).filter(d => d !== undefined);
    if (days.length) rep.weekdays = [...new Set(days)].sort();
  }
  if (unit === 'month') {
    const nth = (p.BYDAY || '').match(/^(-?\d+)([A-Z]{2})$/);
    if (nth && RRULE_DAYS[nth[2]] !== undefined) {
      rep.monthMode = 'nth';
      rep.nthWeek = Math.max(-1, Math.min(4, parseInt(nth[1], 10)));
      rep.nthDay = RRULE_DAYS[nth[2]];
    } else if (p.BYDAY && p.BYSETPOS && RRULE_DAYS[p.BYDAY] !== undefined) {
      rep.monthMode = 'nth';
      rep.nthWeek = Math.max(-1, Math.min(4, parseInt(p.BYSETPOS, 10)));
      rep.nthDay = RRULE_DAYS[p.BYDAY];
    } else if (p.BYMONTHDAY) {
      rep.monthMode = 'day';
      rep.monthDay = Math.min(31, Math.abs(parseInt(p.BYMONTHDAY, 10)) || 1);
    }
  }
  return rep;
}

// תאריך מהייצוא של RTM — מספר (אלפיות שנייה) או מחרוזת
function rtmDate(v) {
  if (!v) return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  if (isNaN(d)) return null;
  return d;
}

async function importRTM(data) {
  const rawTasks = data.tasks || [];
  const rawLists = data.lists || [];
  const rawNotes = data.notes || [];

  // שמות רשימות לפי מזהה (מדלגים על "רשימות חכמות" שהן בעצם חיפושים)
  const listNames = {};
  for (const l of rawLists) {
    if (l.smart) continue;
    listNames[l.id] = l.name;
  }
  const SKIP_LISTS = ['Inbox', 'Sent', 'Trash'];

  // הערות לפי המשימה שאליה הן שייכות
  const notesByTask = {};
  for (const n of rawNotes) {
    const key = n.series_id ?? n.task_id ?? n.taskseries_id;
    if (key == null) continue;
    const text = [n.title, n.content || n.body].filter(Boolean).join(': ');
    if (!text) continue;
    (notesByTask[key] = notesByTask[key] || []).push(text);
  }

  const existingLists = new Map(state.lists.map(l => [l.name, l.id]));
  const existingTasks = new Set(state.tasks.map(t => `${t.title}|${t.due || ''}`));
  const res = { added: 0, done: 0, dup: 0, failed: 0 };

  for (const t of rawTasks) {
    try {
      const title = t.name || t.title;
      if (!title) { res.failed++; continue; }
      if (t.date_completed || t.completed || t.date_trashed || t.deleted) { res.done++; continue; }

      const dueD = rtmDate(t.date_due ?? t.due);
      const due = dueD ? dateToStr(dueD) : null;
      const hasTime = !!(t.date_due_has_time ?? t.has_due_time) && dueD;
      const time = hasTime ? `${pad(dueD.getHours())}:${pad(dueD.getMinutes())}` : null;

      if (existingTasks.has(`${title}|${due || ''}`)) { res.dup++; continue; }
      existingTasks.add(`${title}|${due || ''}`);

      // עדיפות ב-RTM: 1-3, וכל ערך אחר = ללא
      const pr = parseInt(t.priority, 10);
      const priority = (pr >= 1 && pr <= 3) ? pr : 0;

      const repeat = repeatFromRRule(t.repeat || t.rrule, t.repeat_every ?? t.every);

      const noteParts = notesByTask[t.series_id ?? t.id] || [];
      const tags = Array.isArray(t.tags) && t.tags.length ? 'תגיות: ' + t.tags.join(', ') : '';
      const notes = [...noteParts, tags].filter(Boolean).join('\n');

      // רשימה — נוצרת אצלנו אם עוד לא קיימת
      let listId = null;
      const listName = listNames[t.list_id];
      if (listName && !SKIP_LISTS.includes(listName)) {
        if (existingLists.has(listName)) listId = existingLists.get(listName);
        else {
          listId = await store.add('lists', {
            name: listName,
            color: LIST_COLORS[existingLists.size % LIST_COLORS.length],
            order: existingLists.size
          });
          existingLists.set(listName, listId);
        }
      }

      const reminders = time ? [{ daysBefore: 0, time }] : [];
      await store.add('tasks', {
        title, notes, listId, priority,
        due, time,
        repeat,
        reminders,
        remindAts: remindAtsFor(due, reminders),
        notifiedAt: null,
        done: false, completedAt: null, createdAt: Date.now()
      });
      res.added++;
    } catch (e) {
      console.error('ייבוא משימה נכשל:', e, t);
      res.failed++;
    }
  }
  return res;
}
window.__rtmImport = importRTM; // לבדיקות ולפתרון תקלות

// ===== 4. שמירת נתונים =====
// שני מצבים עם אותו ממשק: LocalStore (במכשיר בלבד) ו-FirebaseStore (מסונכרן).

const LIST_COLORS = ['#6c5ce7', '#e05c5c', '#f0a13c', '#27ae60', '#4a90d9', '#d268b8', '#16a2b8', '#8a6d4b'];

const state = {
  tasks: [], lists: [], settings: {},
  view: { type: 'today', listId: null, q: '' },
  demo: false
};

let store = null;
let render = () => {};

class LocalStore {
  constructor() {
    this.key = 'myTasksData';
    const raw = localStorage.getItem(this.key);
    this.data = raw ? JSON.parse(raw) : { tasks: [], lists: [], settings: {} };
  }
  init() { this._emit(); }
  _save() { localStorage.setItem(this.key, JSON.stringify(this.data)); this._emit(); }
  _emit() {
    state.tasks = [...this.data.tasks];
    state.lists = [...this.data.lists].sort((a, b) => (a.order || 0) - (b.order || 0));
    state.settings = { ...this.data.settings };
    render();
  }
  _id() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  async add(kind, obj) {
    const id = this._id();
    this.data[kind === 'lists' ? 'lists' : 'tasks'].push({ ...obj, id });
    this._save(); return id;
  }
  async update(kind, id, patch) {
    const arr = this.data[kind === 'lists' ? 'lists' : 'tasks'];
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) { arr[i] = { ...arr[i], ...patch }; this._save(); }
  }
  async remove(kind, id) {
    const k = kind === 'lists' ? 'lists' : 'tasks';
    this.data[k] = this.data[k].filter(x => x.id !== id);
    this._save();
  }
  async saveSettings(patch) { this.data.settings = { ...this.data.settings, ...patch }; this._save(); }
  async saveDeviceToken() { /* אין סנכרון במצב מקומי */ }
}

class FirebaseStore {
  constructor(fb) { this.fb = fb; }
  init() {
    const { fns, db } = this.fb;
    const coll = { tasks: 'tasks', lists: 'taskLists' };
    for (const [kind, name] of Object.entries(coll)) {
      fns.onSnapshot(fns.collection(db, name), snap => {
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (kind === 'lists') state.lists = arr.sort((a, b) => (a.order || 0) - (b.order || 0));
        else state.tasks = arr;
        render();
      }, err => {
        console.error(err);
        toast('בעיית הרשאות במסד הנתונים — צריך לעדכן את חוקי האבטחה (שלב בהתקנה)');
      });
    }
    fns.onSnapshot(fns.doc(db, 'taskMeta', 'settings'), snap => {
      state.settings = snap.exists() ? snap.data() : {};
      applyBackground(state.settings.background);
      render();
    }, () => {});
  }
  async add(kind, obj) {
    const { fns, db } = this.fb;
    const ref = await fns.addDoc(fns.collection(db, kind === 'lists' ? 'taskLists' : 'tasks'), obj);
    return ref.id;
  }
  async update(kind, id, patch) {
    const { fns, db } = this.fb;
    await fns.updateDoc(fns.doc(db, kind === 'lists' ? 'taskLists' : 'tasks', id), patch);
  }
  async remove(kind, id) {
    const { fns, db } = this.fb;
    await fns.deleteDoc(fns.doc(db, kind === 'lists' ? 'taskLists' : 'tasks', id));
  }
  async saveSettings(patch) {
    const { fns, db } = this.fb;
    await fns.setDoc(fns.doc(db, 'taskMeta', 'settings'), patch, { merge: true });
  }
  async saveDeviceToken(deviceId, token) {
    const { fns, db } = this.fb;
    await fns.setDoc(fns.doc(db, 'taskMeta', 'tokens'), {
      devices: { [deviceId]: { token, device: navigator.userAgent.slice(0, 120), ts: Date.now() } }
    }, { merge: true });
  }
}

// ===== פעולות על משימות =====

let lastUndo = null;

async function createTask(parsed, extra = {}) {
  let listId = extra.listId ?? null;
  if (parsed.listName) {
    const found = state.lists.find(l => l.name === parsed.listName);
    if (found) listId = found.id;
    else {
      listId = await store.add('lists', {
        name: parsed.listName,
        color: LIST_COLORS[state.lists.length % LIST_COLORS.length],
        order: state.lists.length
      });
      toast(`נוצרה רשימה חדשה: ${parsed.listName}`);
    }
  }
  const reminders = parsed.time ? [{ daysBefore: 0, time: parsed.time }] : [];
  const task = {
    title: parsed.title || 'משימה ללא שם',
    notes: '',
    listId,
    priority: parsed.priority || 0,
    due: parsed.due || null,
    time: parsed.time || null,
    repeat: parsed.repeat || null,
    reminders,
    remindAts: remindAtsFor(parsed.due, reminders),
    notifiedAt: null,
    done: false,
    completedAt: null,
    createdAt: Date.now()
  };
  await store.add('tasks', task);
}

async function completeTask(t) {
  if (t.repeat) {
    const nextDue = computeNextDue(t.repeat, t.due);
    const rems = getReminders(t);
    lastUndo = { id: t.id, patch: { due: t.due, remindAts: t.remindAts || null, notifiedAt: t.notifiedAt || null } };
    await store.update('tasks', t.id, {
      due: nextDue,
      reminders: rems,
      remindAts: remindAtsFor(nextDue, rems),
      remindAt: null,
      notifiedAt: null
    });
    toast(`יופי! הפעם הבאה: ${fmtDueLabel(nextDue)}`, 'ביטול', async () => {
      await store.update('tasks', lastUndo.id, lastUndo.patch);
    });
  } else {
    lastUndo = { id: t.id, patch: { done: false, completedAt: null } };
    await store.update('tasks', t.id, { done: true, completedAt: Date.now() });
    toast('המשימה הושלמה ✔', 'ביטול', async () => {
      await store.update('tasks', lastUndo.id, lastUndo.patch);
    });
  }
}

// נודניק — מוסיף תזכורת חד-פעמית נוספת בלי לשנות את תאריך המשימה
async function snoozeReminder(t, atMs, label) {
  const remindAts = [...new Set([...(t.remindAts || []), atMs])].sort((a, b) => a - b);
  await store.update('tasks', t.id, { remindAts });
  toast(`⏰ אזכיר שוב ${label}`);
}

function openSnoozeMenu(t) {
  const now = new Date();
  const opts = [];
  opts.push(['h1', '⏰ תזכורת שוב בעוד שעה']);
  if (now.getHours() < 18) opts.push(['eve', '🌆 תזכורת הערב ב-19:00']);
  opts.push(['tmr', '☀️ תזכורת מחר ב-09:00']);
  opts.push(['custom', '⏰ תזכורת בזמן שאבחר...']);
  opts.push(['sep', '']);
  opts.push(['d1', '📅 דחיית המשימה למחר']);
  opts.push(['d7', '📅 דחיית המשימה בשבוע']);
  opts.push(['dcustom', '📅 דחיית המשימה לתאריך שאבחר...']);
  modalShell(`
    <h2>דחייה — ${esc(t.title)}</h2>
    <div class="snooze-list">
      ${opts.map(([a, l]) => a === 'sep' ? '<hr class="snooze-sep">' :
        `<button type="button" class="snooze-opt" data-a="${a}">${l}</button>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" id="sz-cancel">ביטול</button></div>`);
  $('#sz-cancel').onclick = closeModal;
  document.querySelectorAll('.snooze-opt').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'custom') { openCustomSnooze(t); return; }
    if (a === 'dcustom') { openCustomPostpone(t); return; }
    closeModal();
    if (a === 'h1') await snoozeReminder(t, Date.now() + 3600000, 'בעוד שעה');
    else if (a === 'eve') {
      const d = new Date(); d.setHours(19, 0, 0, 0);
      await snoozeReminder(t, d.getTime(), 'הערב ב-19:00');
    } else if (a === 'tmr') {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
      await snoozeReminder(t, d.getTime(), 'מחר ב-09:00');
    } else if (a === 'd1') await postponeTask(t, 1);
    else if (a === 'd7') await postponeTask(t, 7);
  });
}

// תזכורת בתאריך ושעה חופשיים
function openCustomSnooze(t) {
  const now = new Date();
  const defTime = `${pad((now.getHours() + 1) % 24)}:00`;
  modalShell(`
    <h2>⏰ תזכורת בזמן שאבחר</h2>
    <div class="field-row">
      <div class="field"><label>תאריך</label><input type="date" id="cs-date" value="${todayStr()}"></div>
      <div class="field"><label>שעה</label><input type="time" id="cs-time" value="${defTime}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="cs-ok">קביעת תזכורת</button>
      <button class="btn btn-ghost" id="cs-cancel">ביטול</button>
    </div>`);
  $('#cs-cancel').onclick = closeModal;
  $('#cs-ok').onclick = async () => {
    const date = $('#cs-date').value, time = $('#cs-time').value;
    if (!date || !time) return;
    const ms = computeRemindAt(date, time);
    if (ms <= Date.now()) { toast('הזמן שנבחר כבר עבר — בחרי זמן עתידי'); return; }
    closeModal();
    await snoozeReminder(t, ms, `ב${fmtDueLabel(date)} בשעה ${time}`);
  };
}

// דחיית המשימה לתאריך חופשי
function openCustomPostpone(t) {
  modalShell(`
    <h2>📅 דחיית המשימה לתאריך</h2>
    <div class="field"><label>לאיזה תאריך?</label><input type="date" id="cp-date" value="${addDaysStr(todayStr(), 1)}"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="cp-ok">דחייה</button>
      <button class="btn btn-ghost" id="cp-cancel">ביטול</button>
    </div>`);
  $('#cp-cancel').onclick = closeModal;
  $('#cp-ok').onclick = async () => {
    const date = $('#cp-date').value;
    if (!date) return;
    closeModal();
    await postponeTaskTo(t, date);
  };
}

async function postponeTaskTo(t, due) {
  const rems = getReminders(t);
  await store.update('tasks', t.id, {
    due,
    reminders: rems,
    remindAts: remindAtsFor(due, rems),
    remindAt: null,
    notifiedAt: null
  });
  toast(`נדחה ל${fmtDueLabel(due)}`);
}

async function postponeTask(t, days) {
  const base = (t.due && t.due > todayStr()) ? t.due : todayStr();
  await postponeTaskTo(t, addDaysStr(base, days));
}

// ===== 5. ממשק המשתמש =====

const $ = s => document.querySelector(s);

function toast(msg, actionLabel, actionFn) {
  const old = $('#toast'); if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>` + (actionLabel ? `<button>${esc(actionLabel)}</button>` : '');
  if (actionLabel) el.querySelector('button').onclick = () => { actionFn(); el.remove(); };
  document.body.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, 6000);
}

function applyBackground(bg) {
  const valid = ['bg-lilac', 'bg-sky', 'bg-mint', 'bg-peach', 'bg-rose', 'bg-night'];
  const cls = valid.includes(bg) ? bg : 'bg-lilac';
  document.body.classList.remove(...valid);
  document.body.classList.add(cls);
  localStorage.setItem('tasksBg', cls);
}

function openTasksCount() {
  const t = todayStr();
  return state.tasks.filter(x => !x.done && x.due && x.due <= t).length;
}

function renderSidebar() {
  const t = todayStr();
  const open = state.tasks.filter(x => !x.done);
  const counts = {
    today: open.filter(x => x.due && x.due <= t).length,
    week: open.filter(x => x.due && x.due <= addDaysStr(t, 6)).length,
    all: open.length
  };
  const v = state.view;
  const item = (type, icon, label, count, extra = '') =>
    `<button class="side-item ${v.type === type && !extra ? 'active' : ''}" data-view="${type}">
      <span>${icon}</span><span>${label}</span>${count != null ? `<span class="count">${count}</span>` : ''}
    </button>`;

  let html = `
    ${item('today', '📅', 'היום', counts.today)}
    ${item('week', '🗓️', 'השבוע', counts.week)}
    ${item('all', '📋', 'כל המשימות', counts.all)}
    ${item('done', '✔️', 'הושלמו', null)}
    <div class="side-sep"><span>הרשימות שלי</span><button id="add-list-btn" title="רשימה חדשה">＋</button></div>`;

  html += `<button class="side-item ${v.type === 'list' && v.listId === null ? 'active' : ''}" data-view="list" data-list="">
      <span class="list-dot" style="background:#9a95b5"></span><span>כללי</span>
      <span class="count">${open.filter(x => !x.listId).length}</span></button>`;

  for (const l of state.lists) {
    html += `<button class="side-item ${v.type === 'list' && v.listId === l.id ? 'active' : ''}" data-view="list" data-list="${l.id}">
      <span class="list-dot" style="background:${esc(l.color)}"></span><span>${esc(l.name)}</span>
      <span class="count">${open.filter(x => x.listId === l.id).length}</span></button>`;
  }

  const sb = $('#sidebar');
  sb.innerHTML = html;
  sb.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    state.view = { type: b.dataset.view, listId: b.dataset.list || null, q: '' };
    document.body.classList.remove('sidebar-open');
    render();
  });
  $('#add-list-btn').onclick = e => { e.stopPropagation(); openListModal(null); };
}

function taskRow(t, showList = true) {
  const today = todayStr();
  const list = t.listId ? state.lists.find(l => l.id === t.listId) : null;
  const meta = [];
  if (t.due && !t.done) {
    const cls = t.due < today ? 'overdue' : t.due === today ? 'today-badge' : '';
    meta.push(`<span class="${cls}">📅 ${fmtDueLabel(t.due)}${t.time ? ' ' + t.time : ''}</span>`);
  }
  if (t.repeat) meta.push(`<span>🔁 ${esc(describeRepeat(t.repeat))}</span>`);
  const remCount = getReminders(t).length;
  if (remCount && !t.done) meta.push(`<span>⏰${remCount > 1 ? '×' + remCount : ''}</span>`);
  if (showList && list) meta.push(`<span class="tm-list"><span class="list-dot" style="background:${esc(list.color)}"></span>${esc(list.name)}</span>`);
  if (t.notes) meta.push(`<span class="task-notes-icon">📝</span>`);

  const div = document.createElement('div');
  div.className = `task p${t.priority || 0}` + (t.done ? ' done-task' : '');
  div.innerHTML = `
    <button class="task-check" title="${t.done ? 'החזרה' : 'סימון כהושלם'}">✓</button>
    <div class="task-body">
      <div class="task-title">${esc(t.title)}</div>
      ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
    </div>
    ${!t.done && t.due ? `<div class="task-actions"><button class="snooze-btn" title="נודניק / דחייה">דחייה ⏰</button></div>` : ''}`;

  div.querySelector('.task-check').onclick = async e => {
    e.stopPropagation();
    if (t.done) await store.update('tasks', t.id, { done: false, completedAt: null });
    else await completeTask(t);
  };
  const sn = div.querySelector('.snooze-btn');
  if (sn) sn.onclick = e => { e.stopPropagation(); openSnoozeMenu(t); };
  div.onclick = () => openTaskModal(t);
  return div;
}

function sortTasks(arr) {
  return arr.sort((a, b) =>
    ((a.due || '9999') + (a.time || '99:99')).localeCompare((b.due || '9999') + (b.time || '99:99')) ||
    (a.priority || 9) - (b.priority || 9) ||
    (a.createdAt || 0) - (b.createdAt || 0));
}

function renderMain() {
  const t = todayStr();
  const groupsEl = $('#task-groups');
  groupsEl.innerHTML = '';
  const v = state.view;
  const open = state.tasks.filter(x => !x.done);
  let title = '', groups = [];

  const grp = (label, arr, cls = '') => { if (arr.length) groups.push({ label, arr: sortTasks(arr), cls }); };

  if (v.type === 'today') {
    title = '📅 היום';
    grp('באיחור', open.filter(x => x.due && x.due < t), 'overdue');
    grp('היום', open.filter(x => x.due === t));
  } else if (v.type === 'week') {
    title = '🗓️ השבוע';
    grp('באיחור', open.filter(x => x.due && x.due < t), 'overdue');
    for (let i = 0; i < 7; i++) {
      const d = addDaysStr(t, i);
      grp(i === 0 ? 'היום' : i === 1 ? 'מחר' : `יום ${DAY_NAMES[dayOfWeek(d)]} ${strToDate(d).getDate()}.${strToDate(d).getMonth() + 1}`,
        open.filter(x => x.due === d));
    }
  } else if (v.type === 'all') {
    title = '📋 כל המשימות';
    grp('באיחור', open.filter(x => x.due && x.due < t), 'overdue');
    grp('היום', open.filter(x => x.due === t));
    grp('מחר', open.filter(x => x.due === addDaysStr(t, 1)));
    grp('השבוע', open.filter(x => x.due > addDaysStr(t, 1) && x.due <= addDaysStr(t, 6)));
    grp('בהמשך', open.filter(x => x.due > addDaysStr(t, 6)));
    grp('ללא תאריך', open.filter(x => !x.due));
  } else if (v.type === 'done') {
    title = '✔️ משימות שהושלמו';
    const doneArr = state.tasks.filter(x => x.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 100);
    groups = doneArr.length ? [{ label: '', arr: doneArr, cls: '' }] : [];
  } else if (v.type === 'list') {
    const list = v.listId ? state.lists.find(l => l.id === v.listId) : null;
    title = list
      ? `<span class="list-dot" style="background:${esc(list.color)}"></span> ${esc(list.name)} <button class="btn btn-ghost btn-small" id="edit-list-btn" title="עריכת הרשימה">✏️</button>`
      : '🗂️ כללי';
    const inList = open.filter(x => (x.listId || null) === (v.listId || null));
    grp('באיחור', inList.filter(x => x.due && x.due < t), 'overdue');
    grp('קרוב', inList.filter(x => x.due && x.due >= t));
    grp('ללא תאריך', inList.filter(x => !x.due));
  }

  $('#view-title').innerHTML = title;
  const editBtn = $('#edit-list-btn');
  if (editBtn) editBtn.onclick = () => openListModal(state.lists.find(l => l.id === v.listId));

  if (!groups.length) {
    const msgs = {
      today: ['🎉', 'אין משימות להיום — כל הכבוד!'],
      week: ['🌤️', 'שבוע פנוי! אפשר להוסיף משימה למעלה'],
      all: ['✨', 'עדיין אין משימות. כתבי משימה בתיבה למעלה'],
      done: ['💤', 'עוד לא הושלמו משימות'],
      list: ['📭', 'אין משימות ברשימה הזו']
    };
    const [icon, msg] = msgs[v.type] || msgs.all;
    groupsEl.innerHTML = `<div class="empty-msg"><div class="big">${icon}</div>${msg}</div>`;
    return;
  }

  for (const g of groups) {
    if (g.label) {
      const h = document.createElement('div');
      h.className = 'group-title ' + g.cls;
      h.textContent = g.label;
      groupsEl.appendChild(h);
    }
    for (const task of g.arr) groupsEl.appendChild(taskRow(task, v.type !== 'list'));
  }
}

render = function () {
  renderSidebar();
  renderMain();
};

// --- תצוגה מקדימה חיה של תיבת ההוספה ---
function renderAddPreview() {
  const val = $('#add-input').value.trim();
  const el = $('#add-preview');
  if (!val) { el.innerHTML = ''; return; }
  const p = parseSmartAdd(val);
  const chips = [];
  if (p.due) chips.push(`📅 ${fmtDueLabel(p.due)}${p.time ? ' ' + p.time : ''}`);
  if (p.repeat) chips.push(`🔁 ${describeRepeat(p.repeat)}`);
  if (p.time) chips.push(`⏰ תזכורת ב-${p.time}`);
  if (p.listName) chips.push(`🗂️ ${p.listName}`);
  if (p.priority) chips.push(`🚩 עדיפות ${['', 'גבוהה', 'בינונית', 'נמוכה'][p.priority]}`);
  el.innerHTML = chips.map(c => `<span class="chip">${esc(c)}</span>`).join('') +
    (chips.length ? '' : `<span class="chip chip-help">אפשר לכתוב למשל: "מחר", "כל שבועיים", "ב-14:00", "#קניות"</span>`);
}

// --- חלונית משימה (יצירה מפורטת / עריכה) ---
function closeModal() { const m = $('#modal-wrap'); if (m) m.remove(); }

function modalShell(innerHtml) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.id = 'modal-wrap';
  wrap.innerHTML = `<div class="modal">${innerHtml}</div>`;
  wrap.onclick = e => { if (e.target === wrap) closeModal(); };
  document.body.appendChild(wrap);
  return wrap;
}

function repeatFormHtml(rep) {
  const r = rep || {};
  const mode = !rep ? '' : (r.mode === 'after' ? 'after' : r.unit);
  const opts = [
    ['', 'ללא חזרה'], ['day', 'כל יום / כל כמה ימים'], ['week', 'שבועי (לפי ימים)'],
    ['month', 'חודשי'], ['year', 'שנתי'], ['after', 'אחרי שאני מסיימת']
  ];
  const wd = r.weekdays || [];
  return `
  <div class="field">
    <label>חזרה</label>
    <select id="rep-mode">${opts.map(([v, l]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="repeat-box ${mode ? '' : 'hidden'}" id="rep-box">
      <div class="field" id="rep-interval-row">
        <label>כל כמה? (למשל 2 = כל שבועיים)</label>
        <input type="number" id="rep-interval" min="1" max="365" value="${r.interval || 1}">
      </div>
      <div class="field ${mode === 'week' ? '' : 'hidden'}" id="rep-week-row">
        <label>באילו ימים?</label>
        <div class="weekdays">${DAY_NAMES.map((n, i) =>
          `<button type="button" data-d="${i}" class="${wd.includes(i) ? 'on' : ''}">${n[0] === 'ש' && i === 6 ? 'שב' : n.slice(0, 2)}</button>`).join('')}</div>
      </div>
      <div class="field ${mode === 'month' ? '' : 'hidden'}" id="rep-month-row">
        <label>איך לחזור בחודש?</label>
        <select id="rep-month-mode">
          <option value="day" ${r.monthMode !== 'nth' ? 'selected' : ''}>בתאריך קבוע בחודש</option>
          <option value="nth" ${r.monthMode === 'nth' ? 'selected' : ''}>ביום מסוים (למשל: ראשון האחרון)</option>
        </select>
        <div id="rep-month-day-row" class="${r.monthMode === 'nth' ? 'hidden' : ''}" style="margin-top:8px">
          <input type="number" id="rep-month-day" min="1" max="31" value="${r.monthDay || 1}"> בחודש
        </div>
        <div id="rep-month-nth-row" class="field-row ${r.monthMode === 'nth' ? '' : 'hidden'}" style="margin-top:8px">
          <select id="rep-nth-week">${[[1, 'הראשון'], [2, 'השני'], [3, 'השלישי'], [4, 'הרביעי'], [-1, 'האחרון']].map(([v, l]) =>
            `<option value="${v}" ${(r.nthWeek || -1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select id="rep-nth-day">${DAY_NAMES.map((n, i) =>
            `<option value="${i}" ${(r.nthDay || 0) === i ? 'selected' : ''}>יום ${n}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field ${mode === 'after' ? '' : 'hidden'}" id="rep-after-row">
        <label>יחידת זמן אחרי הסיום</label>
        <select id="rep-after-unit">${[['day', 'ימים'], ['week', 'שבועות'], ['month', 'חודשים'], ['year', 'שנים']].map(([v, l]) =>
          `<option value="${v}" ${(r.mode === 'after' ? r.unit : 'week') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="settings-note" id="rep-desc"></div>
    </div>
  </div>`;
}

function readRepeatForm() {
  const mode = $('#rep-mode').value;
  if (!mode) return null;
  const interval = Math.max(1, Number($('#rep-interval').value) || 1);
  if (mode === 'after') return { mode: 'after', unit: $('#rep-after-unit').value, interval };
  const rep = { mode: 'schedule', unit: mode, interval };
  if (mode === 'week') {
    const days = [...document.querySelectorAll('#rep-week-row .weekdays button.on')].map(b => Number(b.dataset.d));
    if (days.length) rep.weekdays = days.sort();
  }
  if (mode === 'month') {
    rep.monthMode = $('#rep-month-mode').value;
    if (rep.monthMode === 'nth') { rep.nthWeek = Number($('#rep-nth-week').value); rep.nthDay = Number($('#rep-nth-day').value); }
    else rep.monthDay = Math.min(31, Math.max(1, Number($('#rep-month-day').value) || 1));
  }
  return rep;
}

function wireRepeatForm() {
  const upd = () => {
    const mode = $('#rep-mode').value;
    $('#rep-box').classList.toggle('hidden', !mode);
    $('#rep-week-row').classList.toggle('hidden', mode !== 'week');
    $('#rep-month-row').classList.toggle('hidden', mode !== 'month');
    $('#rep-after-row').classList.toggle('hidden', mode !== 'after');
    if (mode === 'month') {
      const mm = $('#rep-month-mode').value;
      $('#rep-month-day-row').classList.toggle('hidden', mm === 'nth');
      $('#rep-month-nth-row').classList.toggle('hidden', mm !== 'nth');
    }
    const rep = readRepeatForm();
    $('#rep-desc').textContent = rep ? '🔁 ' + describeRepeat(rep) : '';
  };
  ['rep-mode', 'rep-interval', 'rep-month-mode', 'rep-month-day', 'rep-nth-week', 'rep-nth-day', 'rep-after-unit']
    .forEach(id => { const el = document.getElementById(id); if (el) el.onchange = upd; });
  document.querySelectorAll('#rep-week-row .weekdays button').forEach(b =>
    b.onclick = () => { b.classList.toggle('on'); upd(); });
  upd();
}

function openTaskModal(t) {
  const isNew = !t;
  t = t || { title: '', notes: '', listId: state.view.type === 'list' ? state.view.listId : null, priority: 0, due: null, time: null, repeat: null, reminders: [] };
  const wrap = modalShell(`
    <h2>${isNew ? 'משימה חדשה' : 'עריכת משימה'}</h2>
    <div class="field"><label>מה צריך לעשות?</label><input type="text" id="tm-title" value="${esc(t.title)}"></div>
    <div class="field"><label>הערות</label><textarea id="tm-notes">${esc(t.notes || '')}</textarea></div>
    <div class="field-row">
      <div class="field"><label>תאריך</label><input type="date" id="tm-due" value="${t.due || ''}"></div>
      <div class="field"><label>שעה (לא חובה)</label><input type="time" id="tm-time" value="${t.time || ''}"></div>
    </div>
    <div class="field">
      <label>רשימה</label>
      <select id="tm-list">
        <option value="">כללי</option>
        ${state.lists.map(l => `<option value="${l.id}" ${t.listId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>עדיפות</label>
      <div class="seg" id="tm-priority">
        ${[[0, 'רגילה'], [3, 'נמוכה'], [2, 'בינונית'], [1, 'גבוהה']].map(([v, l]) =>
          `<button type="button" data-v="${v}" class="${(t.priority || 0) === v ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    ${repeatFormHtml(t.repeat)}
    <div class="field">
      <label>⏰ תזכורות לטלפון</label>
      <div id="tm-rems"></div>
      <button type="button" class="btn btn-ghost btn-small" id="tm-rem-add">+ הוספת תזכורת</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="tm-save">${isNew ? 'הוספה' : 'שמירה'}</button>
      ${!isNew ? '<button class="btn btn-danger" id="tm-delete">מחיקה</button>' : ''}
      <button class="btn btn-ghost" id="tm-cancel">ביטול</button>
    </div>`);

  wireRepeatForm();
  $('#tm-priority').querySelectorAll('button').forEach(b => b.onclick = () => {
    $('#tm-priority').querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  // עורך התזכורות — רשימה דינמית של "מתי + באיזו שעה"
  const rems = getReminders(t).map(r => ({ daysBefore: r.daysBefore || 0, time: r.time || '09:00' }));
  function renderRems() {
    const box = $('#tm-rems');
    box.innerHTML = rems.length ? rems.map((r, i) => `
      <div class="rem-row">
        <select data-i="${i}" class="rem-days">${REM_DAYS_OPTS.map(([v, l]) =>
          `<option value="${v}" ${r.daysBefore === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span>בשעה</span>
        <input type="time" data-i="${i}" class="rem-time" value="${r.time}">
        <button type="button" class="rem-del" data-i="${i}" title="הסרת התזכורת">✕</button>
      </div>`).join('')
      : '<div class="settings-note" style="margin-bottom:6px">אין תזכורות למשימה הזו</div>';
    box.querySelectorAll('.rem-days').forEach(el => el.onchange = () => { rems[el.dataset.i].daysBefore = Number(el.value); });
    box.querySelectorAll('.rem-time').forEach(el => el.onchange = () => { rems[el.dataset.i].time = el.value || '09:00'; });
    box.querySelectorAll('.rem-del').forEach(el => el.onclick = () => { rems.splice(Number(el.dataset.i), 1); renderRems(); });
  }
  renderRems();
  $('#tm-rem-add').onclick = () => {
    if (rems.length >= 5) { toast('עד 5 תזכורות למשימה'); return; }
    rems.push({ daysBefore: 0, time: $('#tm-time').value || '09:00' });
    renderRems();
  };
  $('#tm-cancel').onclick = closeModal;
  if (!isNew) $('#tm-delete').onclick = async () => {
    if (confirm('למחוק את המשימה לצמיתות?')) { await store.remove('tasks', t.id); closeModal(); toast('המשימה נמחקה'); }
  };

  $('#tm-save').onclick = async () => {
    const title = $('#tm-title').value.trim();
    if (!title) { $('#tm-title').focus(); return; }
    const repeat = readRepeatForm();
    let due = $('#tm-due').value || null;
    const time = $('#tm-time').value || null;
    if (repeat && !due) due = firstDueForRepeat(repeat);
    if (rems.length && !due) { toast('לתזכורות צריך לבחור תאריך למשימה'); return; }
    const patch = {
      title, notes: $('#tm-notes').value.trim(),
      listId: $('#tm-list').value || null,
      priority: Number($('#tm-priority').querySelector('.on').dataset.v),
      due, time, repeat,
      reminders: rems,
      remindAts: remindAtsFor(due, rems),
      remindAt: null,
      notifiedAt: null
    };
    if (isNew) await store.add('tasks', { ...patch, done: false, completedAt: null, createdAt: Date.now() });
    else await store.update('tasks', t.id, patch);
    closeModal();
  };
}

// --- חלונית רשימה ---
function openListModal(list) {
  const isNew = !list;
  const color = list ? list.color : LIST_COLORS[state.lists.length % LIST_COLORS.length];
  modalShell(`
    <h2>${isNew ? 'רשימה חדשה' : 'עריכת רשימה'}</h2>
    <div class="field"><label>שם הרשימה</label><input type="text" id="lm-name" value="${esc(list ? list.name : '')}" placeholder="למשל: קניות, עבודה, בית"></div>
    <div class="field"><label>צבע</label>
      <div class="color-row" id="lm-colors">
        ${LIST_COLORS.map(c => `<button type="button" data-c="${c}" class="${c === color ? 'on' : ''}" style="background:${c}"></button>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="lm-save">${isNew ? 'יצירה' : 'שמירה'}</button>
      ${!isNew ? '<button class="btn btn-danger" id="lm-delete">מחיקה</button>' : ''}
      <button class="btn btn-ghost" id="lm-cancel">ביטול</button>
    </div>`);
  $('#lm-colors').querySelectorAll('button').forEach(b => b.onclick = () => {
    $('#lm-colors').querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  });
  $('#lm-cancel').onclick = closeModal;
  if (!isNew) $('#lm-delete').onclick = async () => {
    if (!confirm(`למחוק את הרשימה "${list.name}"? המשימות שבה יעברו ל"כללי".`)) return;
    for (const task of state.tasks.filter(x => x.listId === list.id)) {
      await store.update('tasks', task.id, { listId: null });
    }
    await store.remove('lists', list.id);
    state.view = { type: 'all', listId: null, q: '' };
    closeModal();
  };
  $('#lm-save').onclick = async () => {
    const name = $('#lm-name').value.trim();
    if (!name) { $('#lm-name').focus(); return; }
    const c = $('#lm-colors .on').dataset.c;
    if (isNew) {
      const id = await store.add('lists', { name, color: c, order: state.lists.length });
      state.view = { type: 'list', listId: id, q: '' };
    } else {
      await store.update('lists', list.id, { name, color: c });
    }
    closeModal();
  };
}

// --- חלונית הגדרות ---
function openSettingsModal() {
  const bgs = [
    ['bg-lilac', 'linear-gradient(160deg,#f4f2fb,#d9cff2)'], ['bg-sky', 'linear-gradient(160deg,#eef6fc,#b9dcf3)'],
    ['bg-mint', 'linear-gradient(160deg,#eefaf3,#b3e6cb)'], ['bg-peach', 'linear-gradient(160deg,#fdf3ec,#f6c9a8)'],
    ['bg-rose', 'linear-gradient(160deg,#fdf0f4,#f2b6d0)'], ['bg-night', 'linear-gradient(160deg,#2d2a3e,#5b5086)']
  ];
  const cur = localStorage.getItem('tasksBg') || 'bg-lilac';
  const notifStatus = !('Notification' in window) ? '<span class="status-warn">הדפדפן לא תומך בהתראות</span>'
    : Notification.permission === 'granted' && localStorage.getItem('fcmSaved') === '1' ? '<span class="status-ok">✔ פעילות במכשיר הזה</span>'
    : Notification.permission === 'denied' ? '<span class="status-warn">חסומות — אפשר לשנות בהגדרות הדפדפן</span>'
    : 'עוד לא הופעלו במכשיר הזה';

  modalShell(`
    <h2>⚙️ הגדרות</h2>
    <div class="field"><label>רקע האפליקציה</label>
      <div class="bg-row" id="st-bgs">
        ${bgs.map(([k, g]) => `<button type="button" data-bg="${k}" class="${cur === k ? 'on' : ''}" style="background:${g}"></button>`).join('')}
      </div>
    </div>
    <div class="settings-block">
      <h3>🔔 התראות במכשיר הזה</h3>
      <p style="font-size:14.5px;margin-bottom:8px">${notifStatus}</p>
      <button class="btn btn-primary btn-small" id="st-notif">הפעלת התראות במכשיר הזה</button>
      <p class="settings-note">כדי לקבל תזכורות בטלפון: להתקין את האפליקציה במסך הבית, לפתוח אותה, וללחוץ על הכפתור.</p>
    </div>
    <div class="settings-block">
      <h3>☀️ סיכום בוקר יומי</h3>
      <label class="inline-check"><input type="checkbox" id="st-summary" ${state.settings.summaryEnabled !== false ? 'checked' : ''}> לשלוח לי כל בוקר את משימות היום</label>
      <div style="margin-top:8px">בשעה <input type="time" id="st-summary-hour" value="${state.settings.summaryHour || '07:00'}" style="width:110px"></div>
    </div>
    <div class="settings-block">
      <h3>⬇️ ייבוא מ-Remember the Milk</h3>
      <p class="settings-note">באתר של RTM: תפריט ‣ Settings ‣ Account ‣ Export your data.
        יורד קובץ — בוחרים אותו כאן, והמשימות הפתוחות (כולל רשימות וחזרות) ייכנסו לאפליקציה.</p>
      <input type="file" id="st-import" accept=".json,application/json" style="margin-top:8px;max-width:100%">
      <p class="settings-note" id="st-import-result"></p>
    </div>
    <div class="settings-block">
      ${state.demo
        ? '<p class="settings-note">מצב הדגמה — הנתונים נשמרים רק במכשיר הזה.</p>'
        : '<button class="btn btn-ghost btn-small" id="st-logout">יציאה מהחשבון</button>'}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="st-save">שמירה</button>
      <button class="btn btn-ghost" id="st-cancel">ביטול</button>
    </div>`);

  $('#st-bgs').querySelectorAll('button').forEach(b => b.onclick = () => {
    $('#st-bgs').querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    applyBackground(b.dataset.bg);
  });
  $('#st-notif').onclick = enableNotifications;
  $('#st-cancel').onclick = closeModal;
  $('#st-import').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const out = $('#st-import-result');
    try {
      const data = JSON.parse(await file.text());
      const openCount = (data.tasks || []).filter(t => t.name && !t.date_completed && !t.completed && !t.date_trashed && !t.deleted).length;
      if (!openCount) { out.textContent = 'לא נמצאו משימות פתוחות בקובץ — האם זה קובץ הייצוא של RTM?'; return; }
      if (!confirm(`נמצאו ${openCount} משימות פתוחות בקובץ. לייבא אותן?`)) { e.target.value = ''; return; }
      out.textContent = 'מייבאת...';
      const r = await importRTM(data);
      out.innerHTML = `<span class="status-ok">✔ יובאו ${r.added} משימות</span>` +
        (r.dup ? ` · ${r.dup} דולגו (כבר קיימות)` : '') +
        (r.done ? ` · ${r.done} שהושלמו לא יובאו` : '') +
        (r.failed ? ` · <span class="status-warn">${r.failed} נכשלו</span>` : '');
    } catch (err) {
      console.error(err);
      out.textContent = 'הקובץ לא נקרא — ודאי שבחרת את קובץ ה-JSON שירד מ-RTM';
    }
    e.target.value = '';
  };
  const lo = $('#st-logout');
  if (lo) lo.onclick = async () => { await firebaseCtx.authMod.signOut(firebaseCtx.auth); location.reload(); };
  $('#st-save').onclick = async () => {
    await store.saveSettings({
      background: $('#st-bgs .on').dataset.bg,
      summaryEnabled: $('#st-summary').checked,
      summaryHour: $('#st-summary-hour').value || '07:00'
    });
    closeModal();
    toast('ההגדרות נשמרו');
  };
}

// ===== 6. התראות דחיפה =====

let firebaseCtx = null;

async function enableNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    toast('הדפדפן הזה לא תומך בהתראות'); return;
  }
  if (state.demo || !firebaseCtx) {
    toast('התראות יעבדו אחרי חיבור למסד הנתונים (בסיום ההתקנה)'); return;
  }
  if (!window.VAPID_KEY) {
    toast('כמעט! נשאר להשלים את מפתח ההתראות בהתקנה (VAPID)'); return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('ההרשאה לא אושרה — אפשר לאשר בהגדרות הדפדפן'); return; }
    const msgMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
    // חשוב: משתמשים באותו Service Worker של האפליקציה (sw.js), שמטפל גם בהתראות.
    // רישום של שני עובדים שונים באותה כתובת גורם להם לדרוס זה את זה.
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const messaging = msgMod.getMessaging(firebaseCtx.app);
    const token = await msgMod.getToken(messaging, { vapidKey: window.VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) { toast('לא הצלחתי לקבל אישור מהדפדפן, נסי שוב'); return; }
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) { deviceId = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem('deviceId', deviceId); }
    await store.saveDeviceToken(deviceId, token);
    localStorage.setItem('fcmSaved', '1');
    toast('🔔 מעולה! ההתראות פעילות במכשיר הזה');
    closeModal();
  } catch (e) {
    console.error(e);
    toast('שגיאה בהפעלת ההתראות: ' + (e.code || e.message));
  }
}

// ===== 7. כניסה ואתחול =====

function wireShell() {
  $('#menu-btn').onclick = () => document.body.classList.toggle('sidebar-open');
  $('#overlay').onclick = () => document.body.classList.remove('sidebar-open');
  $('#settings-btn').onclick = openSettingsModal;

  const input = $('#add-input');
  input.addEventListener('input', renderAddPreview);
  async function submitAdd() {
    const val = input.value.trim();
    if (!val) { openTaskModal(null); return; }
    const parsed = parseSmartAdd(val);
    const listId = (!parsed.listName && state.view.type === 'list') ? state.view.listId : undefined;
    await createTask(parsed, listId !== undefined ? { listId } : {});
    input.value = '';
    renderAddPreview();
    toast('המשימה נוספה ✔');
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } });
  $('#add-btn').onclick = submitAdd;
}

// ===== תזכורות מקומיות כשהאפליקציה פתוחה =====
// כשהאפליקציה פתוחה, ההתראה קופצת מיד בזמן המדויק — בלי לחכות לשרת.
// לא מסמנים במסד (כדי שהשרת עדיין ישלח למכשירים האחרים); התג הזהה מונע כפילות.
function startLocalReminderWatch() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  const shown = new Set(JSON.parse(localStorage.getItem('shownReminders') || '[]'));
  setInterval(async () => {
    if (Notification.permission !== 'granted') return;
    const now = Date.now();
    for (const t of state.tasks) {
      if (t.done) continue;
      const ats = (Array.isArray(t.remindAts) && t.remindAts.length) ? t.remindAts
        : (t.remindAt ? [t.remindAt] : []);
      for (const ms of ats) {
        if (ms > now || ms < now - 10 * 60000) continue; // רק תזכורות מ-10 הדקות האחרונות
        if (t.notifiedAt && t.notifiedAt >= ms) continue; // השרת כבר שלח — לא מכפילים
        const key = t.id + ':' + ms;
        if (shown.has(key)) continue;
        shown.add(key);
        localStorage.setItem('shownReminders', JSON.stringify([...shown].slice(-100)));
        try {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification('⏰ ' + t.title, {
            body: t.time ? `היום בשעה ${t.time}` : 'תזכורת למשימה',
            icon: './icon-192.png', dir: 'rtl', lang: 'he',
            tag: 'task-' + t.id,
            data: { url: './', taskId: t.id },
            actions: [{ action: 'snooze60', title: '⏰ נודניק שעה' }, { action: 'done', title: '✔ בוצע' }]
          });
        } catch (e) { console.error(e); }
      }
    }
  }, 30000);
}

// פעולה שהגיעה מלחיצה על כפתור בהתראה (נודניק / בוצע) — דרך כתובת עם פרמטרים
function handleNotificationAction() {
  const p = new URLSearchParams(location.search);
  const act = p.get('act'), id = p.get('task');
  if (!act || !id) return;
  history.replaceState(null, '', location.pathname);
  let attempts = 30;
  (function tryRun() {
    const t = state.tasks.find(x => x.id === id);
    if (!t) { if (attempts-- > 0) setTimeout(tryRun, 400); return; }
    if (act === 'snooze60') snoozeReminder(t, Date.now() + 3600000, 'בעוד שעה');
    else if (act === 'done' && !t.done) {
      // אישור לפני סימון — כדי שלחיצה לא מכוונת על ההתראה לא תסגור משימה בטעות
      modalShell(`
        <h2>לסמן כבוצע? ✔</h2>
        <p style="margin-bottom:16px;font-size:16px">${esc(t.title)}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="cf-yes">כן, בוצע</button>
          <button class="btn btn-ghost" id="cf-no">לא</button>
        </div>`);
      $('#cf-yes').onclick = async () => { closeModal(); await completeTask(t); };
      $('#cf-no').onclick = closeModal;
    }
  })();
}

function showApp(demo) {
  state.demo = demo;
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#demo-banner').classList.toggle('hidden', !demo);
  wireShell();
  store.init();
  handleNotificationAction();
  startLocalReminderWatch();
}

function startLocal() {
  store = new LocalStore();
  showApp(true);
}

async function startFirebase(fb) {
  store = new FirebaseStore(fb);
  showApp(false);
}

async function initFirebase() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]);
  const app = appMod.initializeApp(window.FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  const fns = {
    collection: fsMod.collection, doc: fsMod.doc, onSnapshot: fsMod.onSnapshot,
    addDoc: fsMod.addDoc, updateDoc: fsMod.updateDoc, deleteDoc: fsMod.deleteDoc, setDoc: fsMod.setDoc
  };
  firebaseCtx = { app, auth, authMod, db, fns };
  return firebaseCtx;
}

function showLogin(fb) {
  $('#login-screen').classList.remove('hidden');
  const form = $('#login-form');
  const err = $('#login-error');
  const hint = $('#signup-hint');
  form.onsubmit = async e => {
    e.preventDefault();
    const pw = $('#login-password').value;
    if (!pw) return;
    err.classList.add('hidden');
    try {
      await fb.authMod.signInWithEmailAndPassword(fb.auth, window.TASKS_EMAIL, pw);
    } catch (ex) {
      if (['auth/user-not-found', 'auth/invalid-credential', 'auth/wrong-password'].includes(ex.code)) {
        err.textContent = 'הסיסמה לא נכונה, נסי שוב';
        hint.classList.remove('hidden');
      } else {
        err.textContent = 'שגיאה בהתחברות: ' + ex.code;
      }
      err.classList.remove('hidden');
    }
  };
  $('#signup-link').onclick = async () => {
    const pw = $('#login-password').value;
    if (!pw || pw.length < 6) {
      err.textContent = 'כתבי בשדה למעלה סיסמה חדשה (לפחות 6 תווים) ואז לחצי שוב';
      err.classList.remove('hidden');
      return;
    }
    if (!confirm('לקבוע את הסיסמה שהקלדת כסיסמה הקבועה של אפליקציית המשימות?')) return;
    try {
      await fb.authMod.createUserWithEmailAndPassword(fb.auth, window.TASKS_EMAIL, pw);
    } catch (ex) {
      err.textContent = ex.code === 'auth/email-already-in-use' ? 'כבר נקבעה סיסמה בעבר — נסי להיזכר בה' : 'שגיאה: ' + ex.code;
      err.classList.remove('hidden');
    }
  };
}

async function main() {
  applyBackground(localStorage.getItem('tasksBg'));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  const demoMode = new URLSearchParams(location.search).has('demo');
  if (demoMode || !window.FIREBASE_CONFIG) { startLocal(); return; }
  try {
    const fb = await initFirebase();
    fb.authMod.onAuthStateChanged(fb.auth, user => {
      if (user && user.email === window.TASKS_EMAIL) startFirebase(fb);
      else if (user) { fb.authMod.signOut(fb.auth); showLogin(fb); }
      else showLogin(fb);
    });
  } catch (e) {
    console.error('Firebase לא נטען — עוברים למצב מקומי', e);
    startLocal();
  }
}

main();
