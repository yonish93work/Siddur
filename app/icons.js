// Line drawings for buttons, all in one style (drawn for this app). 24 x 24, coloured by the surrounding text.
const svg = body => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  shacharit: svg('<path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M12 6v3M5.6 9.6l2 2M18.4 9.6l-2 2M2.5 14h2M19.5 14h2"/>'),
  mincha: svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  arvit: svg('<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13A7 7 0 0 1 15.5 3.5z"/><path d="M18 6.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>'),
  cup: svg('<path d="M7 3h10c0 5-2 8-5 8s-5-3-5-8z"/><path d="M12 11v7M8 21h8M9.5 18h5"/>'),
  jug: svg('<path d="M7 7h9l-1 13H8z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2.3M7 7c0-2 1.5-3 4.5-3S16 5 16 7"/><path d="M5 4l2 3"/>'),
  road: svg('<path d="M9 3 5 21M15 3l4 18"/><path d="M12 5v2M12 10v2.5M12 16v3"/>'),
  grapes: svg('<circle cx="9" cy="10" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="11" cy="13.5" r="2"/><circle cx="15" cy="13.5" r="2"/><circle cx="13" cy="17" r="2"/><circle cx="7" cy="13.5" r="2"/><path d="M11 8c0-2 1-3.5 3-4.5M14 4.5c2 0 3 1 3.5 2"/>'),
  book: svg('<path d="M12 6.5C10 5 6.5 4.5 3 5v13c3.5-.5 7 0 9 1.5 2-1.5 5.5-2 9-1.5V5c-3.5-.5-7 0-9 1.5z"/><path d="M12 6.5V19.5"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8 13h2M14 13h2M8 16.5h2M14 16.5h2"/>'),
  scroll: svg('<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-4 0v-1H4v1a2 2 0 0 0 2 2h8"/><path d="M7 4a2 2 0 0 0-2 2v11M9 9h4M9 12.5h4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/><circle cx="12" cy="12" r="6.5"/>'),
  candle: svg('<path d="M12 3c1.5 2 1.5 3.5 0 5-1.5-1.5-1.5-3 0-5z"/><rect x="9.5" y="9" width="5" height="10" rx="1"/><path d="M6 21h12"/>'),
  moonStar: svg('<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13A7 7 0 0 1 15.5 3.5z"/>'),
  omer: svg('<path d="M12 21V8M12 8c-1-2-1-4 0-5 1 1 1 3 0 5zM12 12c-2-1-3.5-3-3.5-5 2 .5 3.5 2.5 3.5 5zM12 12c2-1 3.5-3 3.5-5-2 .5-3.5 2.5-3.5 5zM12 16c-2-1-3.5-3-3.5-5 2 .5 3.5 2.5 3.5 5zM12 16c2-1 3.5-3 3.5-5-2 .5-3.5 2.5-3.5 5z"/>'),
  bed: svg('<path d="M3 18V8M3 14h18v4M21 18v-4a3 3 0 0 0-3-3h-8v3"/><circle cx="6.5" cy="11.5" r="1.5"/>'),
  share: svg('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"/>'),
  back: svg('<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.4 13.4 8.5 15.5l2.1-4.9z"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
};
