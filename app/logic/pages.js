// Printed page labels <-> PDF pages. Labels are strings: '105', '76א', or '@116' for PDF page 116.
export function pageIndex(pages) {
  const by = new Map();
  for (const p of pages) if (p.label != null) by.set(p.label, [...(by.get(p.label) ?? []), p.pdf]);
  const raw = l => (String(l).startsWith('@') ? [Number(String(l).slice(1))] : by.get(String(l)));
  const first = l => raw(l)?.[0] ?? null;
  const last = l => raw(l)?.at(-1) ?? null; // a number printed on two pages: include both
  return {
    pages, first, last,
    label: n => pages[n - 1]?.label ?? null,
    range(from, to = from) {
      const a = first(from), b = last(to);
      if (!a || !b || b < a) return [];
      return Array.from({ length: b - a + 1 }, (_, k) => a + k);
    },
  };
}
