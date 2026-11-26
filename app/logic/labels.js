// Short names for the small day squares of the calendar. A square shows one coloured tag (a single short word),
// a line under it with the details in the same colour, and one more muted line (Shabbat name or the portion).
// Example: "פסח ג׳ (חוה״מ)" -> tag "פסח ג׳", detail "חוה״מ".
const RULES = [
  // [pattern, tag, detail (may use $1)]
  // The day of the festival goes inside the tag ("חנוכה ב׳"), so the square needs one line less.
  [/^ראש השנה ב׳$/, 'ר״ה ב׳', ''], [/^ראש השנה/, 'ר״ה א׳', ''],
  [/^יום כיפור$/, 'כיפור', ''],
  [/^סוכות ז׳ \(הושענא רבה\)$/, 'סוכות ז׳', 'הושענא רבה'],
  [/^סוכות (\S+) \(חוה״מ\)$/, 'סוכות $1', 'חוה״מ'], [/^סוכות (\S+)$/, 'סוכות $1', ''],
  [/^שמיני עצרת/, 'שמע״צ', 'שמחת תורה'], [/^שמחת תורה$/, 'שמח״ת', ''],
  [/^חנוכה, יום (\S+)$/, 'חנוכה $1', ''],
  [/^פסח (\S+) \(חוה״מ\)$/, 'פסח $1', 'חוה״מ'], [/^פסח (\S+)$/, 'פסח $1', ''],
  [/^שבועות (\S+)$/, 'שבועות', '$1'], [/^שבועות$/, 'שבועות', ''],
  [/^שושן פורים$/, 'פורים', 'שושן'], [/^פורים$/, 'פורים', ''],
  [/^צום גדליה$/, 'צום', 'גדליה'], [/^עשרה בטבת$/, 'צום', 'י׳ בטבת'], [/^תענית אסתר$/, 'צום', 'אסתר'],
  [/^צום י״ז בתמוז$/, 'צום', 'י״ז בתמוז'], [/^תשעה באב$/, 'צום', 'ט׳ באב'], [/^תשעה באב \(נדחה\)$/, 'צום', 'ט׳ באב נדחה'], [/^תענית בכורות$/, 'תענית', 'בכורות'],
  [/^ראש חודש (.+)$/, 'ר״ח', '$1'],
  [/^יום העצמאות$/, 'עצמאות', ''], [/^יום הזכרון$/, 'זיכרון', ''], [/^יום הזיכרון לחללי מלחמת חרבות ברזל$/, 'זיכרון', 'חרבות ברזל'],
  [/^יום השואה$/, 'שואה', ''], [/^יום ירושלים$/, 'ירושלים', ''], [/^חג הסיגד$/, 'סיגד', ''], [/^יום העליה$/, 'עליה', ''],
];
const MUTED = [
  [/^שבת מברכים.*/, 'מברכים'], [/^שבת (\S+)$/, '$1'], [/^פרשת /, ''], [/^ערב יום כיפור$/, 'ערב כיפור'],
  [/^ערב ראש השנה$/, 'ערב ר״ה'], [/^ערב תשעה באב$/, 'ערב ט׳ באב'], [/^שושן פורים קטן$/, 'שושן פ״ק'],
];
const MAIN = ['holiday', 'fast', 'rc', 'modern'];

// events: [{ text, kind }] of one day -> { kind, tag, detail, extra } (kind is null on an ordinary day)
export function cellLabel(events) {
  const main = MAIN.map(k => events.find(e => e.kind === k)).find(Boolean);
  let tag = '', detail = '', kind = null;
  if (main) {
    kind = main.kind;
    const rule = RULES.find(([re]) => re.test(main.text));
    if (rule) { tag = main.text.replace(rule[0], rule[1]); detail = rule[2] && main.text.replace(rule[0], rule[2]).trim(); }
    else tag = main.text;
    // A second important event the same day (Rosh Chodesh Tevet in Chanukah) joins the detail line.
    const second = MAIN.map(k => events.find(e => e.kind === k && e !== main)).find(Boolean);
    if (second) {
      const r = RULES.find(([re]) => re.test(second.text));
      detail = [detail, r ? second.text.replace(r[0], r[1]) : second.text].filter(Boolean).join(' · ');
    }
  }
  // The muted line: the portion first, then the Shabbat's name (מברכים, זכור...), then small days. Two at most.
  const QUIET = ['parsha', 'shabbat', 'minor'];
  // "ערב פורים" under "צום אסתר", or "ערב פסח" under "תענית בכורות", adds nothing; leave it to the day's details.
  const quiet = events.filter(e => QUIET.includes(e.kind) && e !== main && !(main && /^ערב /.test(e.text)))
    .sort((a, b) => QUIET.indexOf(a.kind) - QUIET.indexOf(b.kind))
    .map(e => { const m = MUTED.find(([re]) => re.test(e.text)); return m ? e.text.replace(m[0], m[1]) : e.text; });
  return { kind, tag, detail, extra: quiet.slice(0, 2).join(' · ') };
}
