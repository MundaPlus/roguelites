/** Small SVG line charts for price history. One series, recessive grid, 2px line, hover crosshair. */

export interface ChartOpts {
  w: number;
  h: number;
  /** Day of the last value. */
  lastDay: number;
  /** Optional reference line (your average cost). */
  ref?: number;
  refLabel?: string;
  label: string;
}

const PAD = { l: 44, r: 12, t: 12, b: 24 };

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = Math.max(1, hi - lo);
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function chartGeom(values: number[], o: ChartOpts) {
  let lo = Math.min(...values, o.ref ?? Infinity);
  let hi = Math.max(...values, o.ref ?? -Infinity);
  const pad = Math.max(1, (hi - lo) * 0.12);
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  const iw = o.w - PAD.l - PAD.r;
  const ih = o.h - PAD.t - PAD.b;
  const x = (i: number): number => PAD.l + (values.length <= 1 ? iw : (i / (values.length - 1)) * iw);
  const y = (v: number): number => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
  return { lo, hi, x, y, iw, ih };
}

/** A full chart with axes, an optional reference line and a hover layer (driven by the app). */
export function lineChart(values: number[], o: ChartOpts): string {
  if (values.length < 2) return `<p class="dim">No price history yet.</p>`;
  const { lo, hi, x, y } = chartGeom(values, o);
  const ticks = niceTicks(lo, hi, 4);
  const grid = ticks
    .map((t) => `<line class="grid" x1="${PAD.l}" x2="${o.w - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${PAD.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)
    .join('');
  const n = values.length;
  // Week labels on the x axis.
  let xl = '';
  for (let i = n - 1; i >= 0; i -= 14) {
    const day = o.lastDay - (n - 1 - i);
    const lbl = i === n - 1 ? 'today' : `${Math.round((day - o.lastDay) / 7)}w`;
    xl += `<text class="tick" x="${x(i)}" y="${o.h - 6}" text-anchor="${i === n - 1 ? 'end' : 'middle'}">${lbl}</text>`;
  }
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${PAD.l},${y(lo)} ${pts} ${x(n - 1)},${y(lo)}`;
  const ref =
    o.ref !== undefined
      ? `<line class="ref" x1="${PAD.l}" x2="${o.w - PAD.r}" y1="${y(o.ref)}" y2="${y(o.ref)}"/><text class="ref-lbl" x="${PAD.l + 4}" y="${y(o.ref) - 5}">${o.refLabel ?? ''} ${Math.round(o.ref)}</text>`
      : '';
  const last = values[n - 1];
  return `<svg class="chart" viewBox="0 0 ${o.w} ${o.h}" role="img" aria-label="${o.label}" data-chart data-n="${n}" data-l="${PAD.l}" data-r="${o.w - PAD.r}">
    ${grid}${xl}
    <polygon class="area" points="${area}"/>
    ${ref}
    <polyline class="line" points="${pts}"/>
    <circle class="dot" cx="${x(n - 1)}" cy="${y(last)}" r="4"/>
    <g class="hover" visibility="hidden"><line class="cross" y1="${PAD.t}" y2="${o.h - PAD.b}"/><circle class="hdot" r="5"/></g>
    <rect class="hit" x="${PAD.l}" y="0" width="${o.w - PAD.l - PAD.r}" height="${o.h}" fill="transparent"/>
  </svg>`;
}

/** Tiny trend line for a table row. */
export function sparkline(values: number[], w = 64, h = 20): string {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
