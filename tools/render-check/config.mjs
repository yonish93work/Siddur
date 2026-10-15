// Settings shared by all the checker scripts.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const PROJECT = fileURLToPath(new URL('../../', import.meta.url));
export const PDF_PATH = join(PROJECT, 'source', 'siddur.pdf');
export const PDF_SHA256 = '43060c858c31297ed5e95bb97d693e471eacda1aa999b33e02d2a50a6e40f7a0';

// 3 = 216 dots per inch: an A4 page becomes 1785 x 2526 pixels, so even a single nikud dot is several pixels.
export const SCALE = 3;

// Pictures and the report are big (about 1GB), so they live outside the project.
export const OUT = process.env.RENDER_CHECK_OUT || join(process.env.USERPROFILE, 'Siddur-Render-Check');
export const dirFor = renderer => join(OUT, renderer);
export const pngName = n => `p${String(n).padStart(3, '0')}.png`;

export const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
