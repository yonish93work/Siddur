// Which pages make up a prayer on a given day, and what to remember on them. No screen code here.
//
// A segment is { title, from, to, why? }. from/to are printed page labels ('105', '80ב') or '@116' = PDF page 116
// (needed where two PDF pages carry the same printed number). "why" explains a page brought from elsewhere.
// All page numbers come from the instructions printed in the siddur itself; the source page is in the comments.
import { PARSHIOT } from './parshiot.js';
import { upcomingParsha, FAST_NAMES } from './calendar.js';
import { HIGHLIGHTS } from './highlights.js';

const seg = (title, from, to = from, why = '') => ({ title, from: String(from), to: String(to), why });

// Psalm of the day, pp. 87-90. The psalm on top of p. 87 is said every day.
const DAY_PSALM = [['87', '87'], ['87', '88'], ['88', '88'], ['88', '89'], ['89', '90'], ['90', '90']];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

// Psalm for the occasion, pp. 92-98 (p. 90: "add here the psalm of the day's occasion").
// Printed number 93 is on two PDF pages (103, 104), hence the @.
export function occasionPsalms(i) {
  const out = [];
  if (i.avel) out.push(seg('מזמור לבית האבל', '98', '98', 'בית האבל'));
  if (i.roshChodesh) out.push(seg('מזמור לראש חודש', '92', '@103', 'ראש חודש'));
  if (i.chanukah) out.push(seg('מזמור לחנוכה', '@103', '@103', 'חנוכה'));
  if (i.fast === 'gedalia' || i.fast === 'tevet') out.push(seg('מזמור לתענית', '@103', '@104', FAST_NAMES[i.fast]));
  if (i.zikaron) out.push(seg('מזמור ליום הזכרון', '@103', '@104', 'יום הזכרון לחללי צה"ל'));
  if (i.purim || i.fast === 'esther') out.push(seg('מזמור לפורים ותענית אסתר', '@104', '95', i.purim ? 'פורים' : FAST_NAMES.esther));
  if (i.fast === 'tammuz') out.push(seg('מזמור לי"ז בתמוז', '95', '95', FAST_NAMES.tammuz));
  if (i.cholHamoed === 'pesach') out.push(seg('מזמור לפסח', '95', '96', 'חול המועד פסח'));
  if (i.cholHamoed === 'sukkot') out.push(seg('מזמור לסוכות', '96', '97', 'חול המועד סוכות'));
  return out;
}

function dayPsalm(i) {
  if (i.weekday > 5) return [];
  const [from, to] = DAY_PSALM[i.weekday];
  const out = [];
  if (from !== '87') out.push(seg('שיר המעלות לדוד', '87'));
  out.push(seg(`שיר של יום ${DAY_NAMES[i.weekday]}`, from, to));
  return out;
}

// Chanukah reading by day, pp. 372-377.
const CHANUKAH_READING = { 1: ['372', '373'], 2: ['373', '373'], 3: ['374', '374'], 4: ['374', '374'], 5: ['374', '374'], 6: ['375', '375'], 7: ['375', '375'], 8: ['375', '377'] };

const isMonThu = i => i.weekday === 1 || i.weekday === 4;

function parshaSegment(i) {
  const n = upcomingParsha(i.d, i.il);
  if (n < 0) return [];
  const [name, from, to] = PARSHIOT[n];
  return [seg(`קריאת התורה: ${name}`, from, to, 'קריאת התורה לשני וחמישי')];
}

// ---------------------------------------------------------------- Shacharit
export function shacharit(i) {
  const s = [];
  s.push(seg('ברכות השחר', '9', '14'));
  if (i.fast !== 'av') s.push(seg('ציצית ותפילין', '15', '16'));
  if (i.fast === 'av') { // p. 43: Haazinu (p. 726) instead of the Song of the Sea
    s.push(seg('סדר הנהגת הבקר ופסוקי דזמרה', '17', '43'));
    s.push(seg('שירת האזינו', '726', '728', 'תשעה באב: במקום שירת הים'));
    s.push(seg('המשך שחרית ועמידה', '45', '66'));
  } else s.push(seg('סדר הנהגת הבקר, פסוקי דזמרה, שמע ועמידה', '17', '66'));
  if (i.ayt && i.fast !== 'av') s.push(seg('אבינו מלכנו', '67', '68', 'עשרת ימי תשובה'));

  if (i.fast === 'av') { // p. 487
    s.push(seg('קינות, קריאת התורה, הפטרה ואשרי', '487', '525', 'תשעה באב'));
    s.push(seg('בית יעקב', '86', '86', 'לפי ההוראה בעמוד 523'));
    s.push(...dayPsalm(i));
    s.push(seg('הושיענו וקדיש', '90', '91'));
    s.push(seg('קוה ועלינו', '99', '104א', 'בלי פיטום הקטורת (עמוד 523)'));
    return s;
  }

  const closing = () => { // after the Torah reading or the kaddish, until the end
    s.push(...dayPsalm(i), ...occasionPsalms(i));
    s.push(seg('הושיענו וקדיש', '90', '91'));
    s.push(seg('קוה, פיטום הקטורת ועלינו', '99', '104א'));
  };

  if (i.roshChodesh && !i.chanukah) { // pp. 348, 364
    s.push(seg('הלל בדילוג, קריאת התורה ואשרי', '348', '356', 'ראש חודש'));
    s.push(seg('מוסף לראש חודש', '357', '364', 'ראש חודש'));
    s.push(seg('בית יעקב', '86'));
    closing();
    return s;
  }
  if (i.chanukah) { // pp. 367, 372, 375
    s.push(seg('הלל שלם', '367', '371', 'חנוכה'));
    s.push(seg('הוצאת ספר תורה', '352', i.roshChodesh ? '353' : '352', 'לפי ההוראה בעמוד 372'));
    s.push(i.roshChodesh
      ? seg('קריאה שניה: חנוכה', '375', '375', 'ראש חודש טבת וחנוכה')
      : seg(`קריאת התורה לחנוכה, יום ${i.chanukah}`, ...CHANUKAH_READING[i.chanukah], 'חנוכה'));
    if (i.roshChodesh) {
      s.push(seg('אשרי, ובא לציון והכנסת ספר תורה', '354', '356', 'ראש חודש'));
      s.push(seg('מוסף לראש חודש', '357', '364', 'ראש חודש'));
      s.push(seg('בית יעקב', '86'));
    } else s.push(seg('סדר היום', '81', '86'));
    closing();
    return s;
  }
  if (i.cholHamoed) { // pp. 66, 411, 418
    s.push(i.cholHamoed === 'pesach' ? seg('הלל בדילוג', '348', '351', 'חול המועד פסח') : seg('הלל שלם', '367', '371', 'חול המועד סוכות'));
    s.push(seg('הוצאת ספר תורה', '352', '352', 'קריאת חול המועד אינה מודפסת בסידור'));
    s.push(seg('סדר היום', '81', '84'));
    s.push(seg('מוסף שלש רגלים', '411', '418', 'חול המועד'));
    s.push(seg('קדיש תתקבל ובית יעקב', '85', '86', 'לפי ההוראה בעמוד 418'));
    closing();
    return s;
  }
  if (i.megillah) { // pp. 66, 385, 408
    s.push(seg('קדיש והוצאת ספר תורה', '77', '79', 'לפי ההוראה בעמוד 66'));
    s.push(seg('קריאת התורה לפורים ואשרי', '385', '386', 'פורים'));
    s.push(seg('מגילת אסתר', '387', '@421', 'פורים'));
    s.push(seg('ואתה קדוש', '83', '86', 'לפי ההוראה בסוף המגילה'));
    closing();
    return s;
  }
  if (i.haatzmaut) { // pp. 419-420
    s.push(seg('הלל', '348', '351', 'יום העצמאות, לפי עמוד 419'));
    if (isMonThu(i)) { s.push(seg('הוצאת ספר תורה וקריאה', '77', '80ב')); s.push(...parshaSegment(i)); }
    s.push(seg('הפטרה ותפלות ליום העצמאות', '419', '420', 'יום העצמאות'));
    s.push(seg('סדר היום', '81', '86'));
    closing();
    return s;
  }
  if (i.fast) { // p. 67, p. 440, p. 455
    const range = { gedalia: ['422', '424א'], tevet: ['425', '429'], esther: ['430', '434'], tammuz: ['435', '439'] }[i.fast];
    s.push(seg(`תחינה ל${FAST_NAMES[i.fast]}`, ...range, FAST_NAMES[i.fast]));
    s.push(seg('סיום לכל התעניות', '440', '451', 'תענית ציבור'));
    s.push(seg('קריאת התורה לתענית', '452', '455', 'תענית ציבור'));
    s.push(seg('סדר היום', '81', '86'));
    closing();
    return s;
  }
  // Ordinary weekday, p. 66 and p. 68
  if (isMonThu(i)) {
    if (i.noTachanun) s.push(seg('קדיש', '77', '77', `אין תחנון: ${i.noTachanun}`));
    else s.push(seg('תחנון לשני וחמישי', '72', '77'));
    s.push(seg('הוצאת ספר תורה וברכות', '78', '80ב'));
    s.push(...parshaSegment(i));
  } else if (!i.noTachanun) s.push(seg('תחנון', '68', '71'));
  s.push(seg('סדר היום', '81', '86'));
  closing();
  return s;
}

// ---------------------------------------------------------------- Mincha, pp. 105-129
export function mincha(i, { adjacent = false } = {}) {
  const s = [];
  if (i.fast === 'av') { // p. 526
    s.push(seg('הוראות למנחת תשעה באב', '526', '526', 'תשעה באב'));
    s.push(seg('למנצח, קטורת ואשרי', '105', '109'));
    s.push(seg('הוצאת ספר תורה וקריאה', '452', '455', 'תשעה באב'));
    s.push(seg('הפטרה לתשעה באב וברכותיה', '456', '457א', 'תשעה באב'));
    s.push(seg('חצי קדיש ועמידה', '109', '121'));
    s.push(seg('נחמות', '526', '531', 'אחרי חזרת הש"ץ'));
    s.push(seg('קדיש ועלינו', '125', '126'));
    return s;
  }
  if (i.fast) { // p. 105 note, p. 20 note
    s.push(seg('פרשת העקידה', '17', '20', 'תענית ציבור: נאמרת בתחילת מנחה'));
    s.push(seg('למנצח, קטורת ואשרי', '105', '109'));
    if (i.fast === 'gedalia') s.push(seg('קריאת התורה והפטרה', '452', '457א', 'צום גדליה'));
    else {
      s.push(seg('הוצאת ספר תורה וקריאה', '452', '455', 'תענית ציבור'));
      s.push(seg('הכנסת ספר תורה', '457א', '457א', 'תענית ציבור'));
    }
    s.push(seg('חצי קדיש ועמידה', '109', '121'));
  } else s.push(seg('מנחה ועמידה', '105', '121'));
  if (i.ayt) s.push(seg('אבינו מלכנו', '121', '122', 'עשרת ימי תשובה'));
  const tachanun = !i.noTachanunMincha && !adjacent;
  if (tachanun) s.push(seg('תחנון', '123', '124'));
  s.push(seg('קדיש תתקבל', '125', '125', tachanun ? '' : i.noTachanunMincha ? `אין תחנון: ${i.noTachanunMincha}` : 'מנחה וערבית סמוכות: בלי תחנון'));
  if (!adjacent) s.push(seg('למנצח ועלינו', '126'));
  s.push(seg('בין מנחה לערבית', '127', i.fast ? '129' : '128'));
  s.push(...dayPsalm(i), ...occasionPsalms(i)); // p. 129
  return s;
}

// ---------------------------------------------------------------- Arvit, pp. 130-158. "i" is the day that begins this night.
export function arvit(i) {
  const s = [];
  if (i.fast === 'av') { // pp. 458-486
    s.push(seg('ערבית, מגילת איכה וקינות', '458', '486', 'ליל תשעה באב'));
    return s;
  }
  if (i.afterShabbat) { s.push(seg('תהלים למוצאי שבת', '331', '341')); s.push(seg('שיר של יום ראשון', '87')); } // p. 341
  if (i.roshChodesh) s.push(seg('שער הרחמים ומזמור לראש חודש', '130', '131', 'ליל ראש חודש'));
  s.push(...occasionPsalms(i).filter(x => !(i.roshChodesh && x.from === '92')));
  s.push(seg('ערבית', '132', '148'));
  if (i.megillah) { // p. 148, p. 408
    s.push(seg('מגילת אסתר', '387', '@421', 'ליל פורים'));
    s.push(seg('ואתה קדוש', '149', '150', 'לפי ההוראה בעמוד 148'));
  } else if (i.afterShabbat) s.push(seg('ויהי נועם ואתה קדוש', '149', '150', 'מוצאי שבת'));
  s.push(seg('קדיש תתקבל, מזמורים ועלינו', '151', '154'));
  if (i.omer) { // p. 154, p. 158
    s.push(seg('ספירת העומר', '155', '158', `ספירת העומר: היום ${i.omer}`));
    s.push(seg('קדיש יהא שלמא', '154', '154', 'אחרי ספירת העומר'));
  }
  if (i.afterShabbat) s.push(seg('סדר הבדלה', '342', '347', 'מוצאי שבת'));
  else if (i.afterYomTov && !i.holy) s.push(seg('הבדלה', '344', '344', 'מוצאי יום טוב: בלי בשמים ונר'));
  return s;
}

export const PRAYERS = {
  shacharit: { name: 'שחרית', build: shacharit },
  mincha: { name: 'מנחה', build: mincha },
  arvit: { name: 'ערבית', build: arvit },
};

// ---------------------------------------------------------------- Reminders
// Each addition in the Amida is marked on its page (highlights.js); its page comes from there.
const PREP = { roshChodesh: 'ביום ראש החודש הזה', pesach: 'ביום חג המצות הזה', sukkot: 'ביום חג הסוכות הזה' };

// [{ page, text, marks }] for one prayer on one day. "page" may be null for a general note;
// "marks" names the boxes in highlights.js to paint yellow on that page.
export function reminders(prayer, i) {
  const out = [];
  const add = (page, text) => out.push({ page: page === null ? null : String(page), text, marks: [], skips: [] });
  const known = m => HIGHLIGHTS[prayer]?.[m];
  // marks: painted yellow (said today). skips: painted grey (printed next to it, not said today).
  const mark = (marks, text, skips = []) => {
    const list = [marks].flat().filter(known);
    if (!list.length) return;
    out.push({ page: HIGHLIGHTS[prayer][list[0]][0], text, marks: list, skips: [skips].flat().filter(known) });
  };
  const skip = (marks, text) => {
    const list = [marks].flat().filter(known);
    if (list.length) out.push({ page: HIGHLIGHTS[prayer][list[0]][0], text, marks: [], skips: list });
  };

  if (prayer === 'arvit' && i.fast === 'av') {
    if (i.afterShabbat) add('470', 'מוצאי שבת: מברכים "בורא מאורי האש" לפני איכה. ההבדלה על הכוס במוצאי תשעה באב');
    if (i.afterShabbat) add('465', 'אתה חוננתנו');
    return out;
  }

  if (prayer === 'shacharit') {
    if (i.ashmorot) add(null, 'אשמורות (סליחות): עמוד 532');
    if (i.ayt) { add('36', 'פיוט לעשרת ימי תשובה'); add('46', 'שיר המעלות ממעמקים'); }
    if (i.cholHamoed) add('37', 'תוספת לחול המועד בברוך שאמר');
    if (i.fast === 'av') {
      add(null, 'בבוקר לא מניחים תפילין ולא מתעטפים בטלית (עמוד 487)');
      add('56', 'נוסח קדושה לתשעה באב');
    }
    if (i.ayt) add('47', 'בקדיש: לעילא לעילא מכל');
  }

  mark(i.geshem ? 'geshem' : 'tal', i.geshem ? 'משיב הרוח ומוריד הגשם (חורף)' : 'מוריד הטל (קיץ)', i.geshem ? 'tal' : 'geshem');
  if (i.ayt) mark('zochrenu', 'זכרנו לחיים');
  if (i.ayt) mark('michamocha', 'מי כמוך אב הרחמן');
  if (i.ayt) mark('kadosh', 'המלך הקדוש');
  if (prayer === 'arvit' && (i.afterShabbat || i.afterYomTov)) mark('havdala', 'אתה חוננתנו (מוצאי שבת)');
  if (i.fast && prayer !== 'arvit') mark('aneinuChazan', 'ש"ץ: עננו ברכה בפני עצמה (בחזרה)');
  mark(i.barech ? 'barech' : 'barchenu', i.barech ? 'ברך עלינו (חורף)' : 'ברכנו (קיץ)', i.barech ? 'barchenu' : 'barech');
  if (i.ayt) mark('mishpat', 'המלך המשפט');
  if (i.fast === 'av') mark('nachem', 'נחם במקום תשכון');
  if (i.fast) mark('aneinu', prayer === 'arvit' ? 'עננו (בלחש), לפי ההוראה בעמוד 143' : 'עננו (בלחש)');
  if (i.roshChodesh || i.cholHamoed) {
    const what = [i.roshChodesh && PREP.roshChodesh, i.cholHamoed && PREP[i.cholHamoed]].filter(Boolean).join(' / ');
    const noRepeat = prayer === 'arvit' && i.roshChodesh ? ' (שכח בליל ראש חודש: לא חוזר)' : ' (שכח: חוזר)';
    const line = [i.roshChodesh && 'yaaleRoshChodesh', i.cholHamoed === 'pesach' && 'yaalePesach', i.cholHamoed === 'sukkot' && 'yaaleSukkot'].filter(Boolean);
    const other = ['yaaleRoshChodesh', 'yaalePesach', 'yaaleSukkot'].filter(x => !line.includes(x));
    mark(['yaale', ...line], `יעלה ויבוא: "${what}"${noRepeat}`, other);
  }
  if (i.chanukah) mark('nissimChanukah', 'על הניסים לחנוכה', prayer === 'arvit' ? [] : 'nissimPurimColumn');
  if (i.purim) mark('nissimPurim', 'על הניסים לפורים', prayer === 'arvit' ? [] : 'nissimChanukahColumn');
  if (i.fast && prayer === 'mincha') mark('kohanim', 'ברכת כהנים לתענית ציבור');
  if (i.ayt) mark('ketov', 'וכתוב לחיים טובים');
  if (i.ayt) mark('sefer', 'ובספר חיים');

  if (prayer === 'shacharit') {
    if (i.noTachanun) add(null, `אין תחנון: ${i.noTachanun}`);
    if (i.noTachanun && !i.roshChodesh && !i.megillah && i.fast !== 'av') skip('yaanecha', 'מדלגים "יענך" (למנצח): יום שאין בו תחנון');
    if (i.noTachanun) skip('tefilaLeDavid', 'מדלגים "תפלה לדוד": יום שאין בו תחנון');
    if (i.avel) add('83', 'בבית האבל ש"ץ מתחיל מ"ואתה קדוש"');
    if (i.megillah || (isMonThu(i) && i.noTachanun && !i.roshChodesh && !i.chanukah && !i.cholHamoed && !i.fast)) add('78', 'מתחילים "יהי ה\' אלהינו עמנו"');
    if (i.ori) add('101', 'יש נוהגים: "לדוד ה\' אורי" (עמוד 128)');
    if (i.hoshanaRaba) add(null, 'הושענא רבה: סדר ההושענות אינו מופיע במפת האפליקציה עדיין');
    if (i.cholHamoed) add(null, 'קריאת התורה של חול המועד אינה מודפסת בסידור');
    if (i.roshChodesh && i.chanukah) add('361', 'על הניסים במוסף');
  }
  if (prayer === 'mincha') {
    if (i.ayt) add('109', 'בקדיש: לעילא לעילא מכל');
    if (i.ayt) add('121', 'ש"ץ: אבינו מלכנו אחרי החזרה');
    if (i.noTachanunMincha) add(null, `אין תחנון: ${i.noTachanunMincha}`);
    if (i.erevShabbat) add('126', '"ה\' מלך" במקום "למנצח" (ערב שבת)');
    if (i.fast && i.fast !== 'av') {
      add('109', 'מוציאים ספר תורה אחרי אשרי, וחוזרים לכאן לחצי קדיש');
      add('128', 'תפלה לעני (תענית ציבור)');
      if (i.noTachanunMincha) add('452', 'מתחילים "יהי ה\' אלהינו עמנו" (אין מחר תחנון)');
    }
    if (i.fast === 'av') add(null, 'מתעטפים בציצית ומניחים תפילין במנחה (עמוד 526)');
  }
  if (prayer === 'arvit') {
    if (i.omer) add('155', `ספירת העומר: ${omerText(i.omer)}`);
    if (i.levana && !i.holy) add(null, 'ברכת הלבנה, אם עוד לא בירכתם: עמוד 159');
    if (i.chanukah) add(null, `חנוכה, נר ${i.chanukah}: הדלקת נרות בעמוד 365`);
    if (i.megillah) add(null, 'קריאת המגילה: עמוד 387');
  }
  hideTheRest(prayer, i, out);
  return out;
}

// Additions printed in the prayer but not said today (זכרנו outside the Ten Days, עננו on a day that is not a fast,
// יעלה ויבוא on an ordinary day...): listed as "skips" without a text, so the reader can hide them (settings).
// Pairs that always have one side said (tal/geshem, barech/barchenu) and the lines inside יעלה ויבוא are already
// handled above; על הניסים is handled here as a whole.
const PAIRED = new Set(['tal', 'geshem', 'barech', 'barchenu', 'yaanecha', 'tefilaLeDavid', 'yaaleRoshChodesh', 'yaalePesach', 'yaaleSukkot']);
function hideTheRest(prayer, i, out) {
  const H = HIGHLIGHTS[prayer] ?? {};
  const used = new Set(out.flatMap(r => [...r.marks, ...r.skips]));
  const keys = Object.keys(H).filter(k => !PAIRED.has(k) && !k.startsWith('nissim') && !k.startsWith('psalm') && !used.has(k));
  if (!i.chanukah && !i.purim) keys.push(...['nissimGeneral', 'nissimChanukah', 'nissimPurim'].filter(k => H[k] && !omittedPages(prayer, i).includes(H[k][0])));
  // The psalms of the other weekdays, on the pages of today's psalm (p. 87, today's pages, and p. 90 for הושיענו).
  if (prayer === 'shacharit' && i.weekday <= 5) {
    const PDF = { 87: '@97', 88: '@98', 89: '@99', 90: '@100' };
    const shown = new Set(['87', ...DAY_PSALM[i.weekday], '90'].map(p => PDF[p]));
    keys.push(...Object.keys(H).filter(k => /^psalm\d/.test(k) && k[5] !== String(i.weekday) && shown.has(H[k][0])));
  }
  for (const k of keys) out.push({ page: H[k][0], text: '', marks: [], skips: [k] });
}

// Whole pages left out of the prayer today: the page of על הניסים in Shacharit and Mincha (p. 64, p. 119) is
// only for Chanukah and Purim. (In Arvit it shares its pages with other text, so it is hidden instead.)
export function omittedPages(prayer, i) {
  const page = HIGHLIGHTS[prayer]?.nissimGeneral?.[0];
  return page && !i.chanukah && !i.purim ? [page] : [];
}

export function omerText(n) {
  const count = (k, one, two, many) => (k === 1 ? one : k === 2 ? two : `${k} ${k > 10 ? 'יום' : many}`);
  const days = k => count(k, 'יום אחד', 'שני ימים', 'ימים');
  const weeks = k => count(k, 'שבוע אחד', 'שני שבועות', 'שבועות');
  if (n < 7) return `היום ${days(n)}`;
  const w = Math.floor(n / 7), r = n % 7;
  const rest = r === 0 ? '' : r > 2 ? ` ו-${days(r)}` : ` ו${days(r)}`;
  return `היום ${days(n)}, שהם ${weeks(w)}${rest}`;
}

// Short names of everything special about a day, for the card on the home screen.
export function dayTitles(i) {
  const t = [];
  if (i.shabbat) t.push('שבת');
  if (i.yomTov) t.push(i.yomTov);
  if (i.roshChodesh) t.push('ראש חודש');
  if (i.cholHamoed) t.push(i.hoshanaRaba ? 'הושענא רבה' : i.cholHamoed === 'pesach' ? 'חול המועד פסח' : 'חול המועד סוכות');
  if (i.chanukah) t.push(`חנוכה, יום ${i.chanukah}`);
  if (i.purim) t.push('פורים');
  if (i.fast) t.push(FAST_NAMES[i.fast]);
  if (i.ayt && !i.yomTov) t.push('עשרת ימי תשובה');
  if (i.haatzmaut) t.push('יום העצמאות');
  if (i.zikaron) t.push('יום הזכרון לחללי צה"ל');
  if (i.erevShabbat) t.push('ערב שבת');
  if (i.omer) t.push(`${i.omer} בעומר`);
  return t;
}
