// Squarified treemap (Bruls, Huizing, van Wijk 2000), iterative: no array copies per step.
import type { DiskMapNode } from '../../global';

export interface Cell {
  node: DiskMapNode;
  x: number; y: number; w: number; h: number;
  depth: number;
  /** Folder drawn with a title strip and its contents inside. */
  open: boolean;
}

export const HEADER = 16;
const PAD = 2;

/** Positions `values` (descending, all > 0) inside the rectangle; returns [x, y, w, h] per value. */
export function squarify(values: number[], x: number, y: number, w: number, h: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = new Array(values.length);
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || w <= 0 || h <= 0) return values.map(() => [x, y, 0, 0]);
  const scale = (w * h) / total;
  let i = 0;
  while (i < values.length) {
    const side = Math.min(w, h);
    // grow the row while the worst aspect ratio keeps improving
    let sum = 0, min = Infinity, max = 0, worst = Infinity, j = i;
    while (j < values.length) {
      const a = values[j] * scale;
      const s2 = sum + a, mn = Math.min(min, a), mx = Math.max(max, a);
      const wr = Math.max((side * side * mx) / (s2 * s2), (s2 * s2) / (side * side * mn));
      if (j > i && wr > worst) break;
      sum = s2; min = mn; max = mx; worst = wr; j++;
    }
    const thick = sum / side;
    let off = 0;
    for (let k = i; k < j; k++) {
      const len = (values[k] * scale) / thick;
      out[k] = w >= h ? [x, y + off, thick, len] : [x + off, y, len, thick];
      off += len;
    }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    i = j;
  }
  return out;
}

/** Cells for the whole visible tree, parents before children. Items smaller than `minPx` on a side are not drawn. */
export function layoutTree(root: DiskMapNode, width: number, height: number, minPx: number): Cell[] {
  const cells: Cell[] = [];
  const visit = (node: DiskMapNode, x: number, y: number, w: number, h: number, depth: number) => {
    const kids = node.kind === 'dir' ? (node.children || []).filter((c) => c.size > 0) : [];
    const innerW = w - PAD * 2, innerH = h - HEADER - PAD;
    const open = kids.length > 0 && innerW >= minPx * 2 && innerH >= minPx * 2;
    cells.push({ node, x, y, w, h, depth, open });
    if (!open) return;
    const rects = squarify(kids.map((c) => c.size), x + PAD, y + HEADER, innerW, innerH);
    kids.forEach((c, i) => {
      const [cx, cy, cw, ch] = rects[i];
      if (cw >= minPx * 0.5 && ch >= minPx * 0.5) visit(c, cx, cy, cw, ch, depth + 1);
    });
  };
  if (width > 0 && height > 0) visit(root, 0, 0, width, height, 0);
  return cells;
}

/** Deepest cell under the point (cells are ordered parents first). */
export function hitTest(cells: Cell[], px: number, py: number): Cell | null {
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h) return c;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: i === 0 ? 0 : v < 10 ? 2 : 1 })} ${u[i]}`;
}
