// Where each addition of the day is printed, so the reader can paint it yellow.
// Page '@n' = PDF page n. Boxes are [left, top, right, bottom] in PDF points from the top-left corner.
// Measured from the text positions in the 2026 PDF and checked by eye on 2026-11-26 (tools: see CLAUDE.md).
// Same layout repeats in the three Amidot, so each prayer lists its own pages.
const FULL = (top, bottom) => [70, top, 525, bottom];

const BARECH = { winter: [[305, 64, 527, 486], [66, 480, 527, 736]], summer: [[66, 64, 296, 473]] };
const NISSIM = (pdf, chanukahBottom, end) => ({
  general: [`@${pdf}`, [FULL(66, 188)]],
  chanukah: [`@${pdf}`, [FULL(66, 188), [316, 188, 527, chanukahBottom], FULL(chanukahBottom - 4, end)]],
  purim: [`@${pdf}`, [FULL(66, 188), [70, 188, 294, 632]]],
});

export const HIGHLIGHTS = {
  shacharit: {
    zochrenu: ['@56', [FULL(278, 304)]], michamocha: ['@56', [FULL(693, 721)]],
    tal: ['@56', [[184, 444, 332, 482]]], geshem: ['@56', [[70, 482, 332, 514]]],
    kadosh: ['@57', [[72, 498, 340, 521]]], aneinuChazan: ['@58', [FULL(340, 598)]],
    barech: ['@59', BARECH.winter], barchenu: ['@59', BARECH.summer],
    mishpat: ['@60', [[76, 379, 270, 407]]], nachem: ['@61', [FULL(426, 770)]], aneinu: ['@62', [FULL(461, 770)]],
    yaale: ['@63', [FULL(375, 772)]],
    yaaleRoshChodesh: ['@63', [[90, 555, 510, 588]]], yaalePesach: ['@63', [[90, 585, 510, 617]]], yaaleSukkot: ['@63', [[90, 613, 510, 646]]],
    ...prefix(NISSIM(65, 644, 790)),
    ketov: ['@66', [[140, 136, 456, 161]]], sefer: ['@67', [FULL(274, 295)]],
    // Skipped on days without Tachanun (pp. 82, 86)
    yaanecha: ['@92', [FULL(497, 795)]], tefilaLeDavid: ['@96', [FULL(68, 530)]],
  },
  mincha: {
    zochrenu: ['@121', [FULL(280, 307)]], michamocha: ['@121', [FULL(695, 723)]],
    tal: ['@121', [[183, 452, 322, 483]]], geshem: ['@121', [[70, 484, 325, 515]]],
    kadosh: ['@122', [[72, 489, 340, 512]]], aneinuChazan: ['@123', [FULL(326, 584)]],
    barech: ['@124', BARECH.winter], barchenu: ['@124', BARECH.summer],
    mishpat: ['@125', [[72, 385, 275, 409]]], nachem: ['@126', [FULL(402, 762)]], aneinu: ['@127', [FULL(461, 772)]],
    yaale: ['@128', [FULL(375, 772)]],
    yaaleRoshChodesh: ['@128', [[90, 555, 510, 588]]], yaalePesach: ['@128', [[90, 585, 510, 617]]], yaaleSukkot: ['@128', [[90, 613, 510, 646]]],
    ...prefix(NISSIM(130, 638, 780)),
    kohanim: ['@131', [FULL(292, 556)]], ketov: ['@131', [[133, 139, 462, 165]]], sefer: ['@132', [FULL(70, 91)]],
  },
  arvit: {
    zochrenu: ['@150', [FULL(660, 685)]], michamocha: ['@151', [[96, 307, 499, 332]]],
    tal: ['@151', [[185, 108, 337, 138]]], geshem: ['@151', [[76, 138, 343, 168]]],
    kadosh: ['@151', [[188, 495, 383, 523]]], havdala: ['@151', [FULL(586, 772)]],
    barech: ['@153', BARECH.winter], barchenu: ['@153', BARECH.summer],
    mishpat: ['@154', [[76, 367, 267, 394]]], aneinu: ['@155', [FULL(630, 796)]],
    yaale: ['@156', [FULL(358, 762)]],
    yaaleRoshChodesh: ['@156', [[90, 538, 510, 571]]], yaalePesach: ['@156', [[90, 567, 510, 600]]], yaaleSukkot: ['@156', [[90, 595, 510, 628]]],
    nissimPurim: ['@157', [FULL(472, 792)]], nissimChanukah: ['@158', [FULL(70, 512)]],
    ketov: ['@158', [[142, 620, 454, 645]]], sefer: ['@159', [FULL(289, 311)]],
  },
};

function prefix(o) {
  return {
    nissimGeneral: o.general, nissimChanukah: o.chanukah, nissimPurim: o.purim,
    nissimChanukahColumn: [o.chanukah[0], o.chanukah[1].slice(1)], nissimPurimColumn: [o.purim[0], o.purim[1].slice(1)],
  };
}
