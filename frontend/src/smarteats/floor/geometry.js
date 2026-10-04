// Geometria della pianta di una sala. Misure e posizioni sono in celle della griglia. Le regole valgono come
// aiuto in schermata (tavoli in rosso, scatto, posto libero): quelle vere le applica il server (utils/roomLayout.js).
export const MAX_TABLE_SIDE = 30;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const isPlaced = (t) => t.x != null;

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const outside = (t, gridW, gridH) => t.x + t.w > gridW || t.y + t.h > gridH;

// Id dei tavoli piazzati che escono dalla sala o ne coprono un altro.
export function conflictIds(tables, gridW, gridH) {
  const placed = tables.filter(isPlaced);
  const bad = new Set();
  for (const t of placed) if (outside(t, gridW, gridH)) bad.add(t.id);
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      if (overlap(placed[i], placed[j])) { bad.add(placed[i].id); bad.add(placed[j].id); }
  return bad;
}

// Sposta di dx, dy celle senza uscire dalla sala.
export const moveBy = (t, dx, dy, gridW, gridH) => ({
  x: clamp(t.x + dx, 0, gridW - t.w),
  y: clamp(t.y + dy, 0, gridH - t.h),
});

// Cambia la misura di dw, dh celle: almeno 1, al massimo fino al bordo della sala.
export const resizeBy = (t, dw, dh, gridW, gridH) => ({
  w: clamp(t.w + dw, 1, Math.min(MAX_TABLE_SIDE, gridW - t.x)),
  h: clamp(t.h + dh, 1, Math.min(MAX_TABLE_SIDE, gridH - t.y)),
});

// Misura iniziale in base ai posti: 2 posti 2×2, 4 posti 3×2, 6 posti 4×2…
export const defaultSize = (seats) => ({ w: clamp(Math.ceil(seats / 2) + 1, 2, 8), h: 2 });

// Primo posto libero (da sinistra in alto) per un tavolo w×h, o null se la sala è piena.
export function findFreeSpot(tables, gridW, gridH, w, h) {
  const placed = tables.filter(isPlaced);
  for (let y = 0; y + h <= gridH; y++)
    for (let x = 0; x + w <= gridW; x++)
      if (!placed.some(t => overlap({ x, y, w, h }, t))) return { x, y };
  return null;
}
