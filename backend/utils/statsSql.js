// Frammenti SQL condivisi dalle statistiche (routes/stats.js): le righe d'ordine degli ordini completati.
// Una riga di `order_items` per prodotto venduto; `i` sono le righe, `o` l'ordine, `p` il prodotto di catalogo (se esiste ancora).
// Il ricavo di riga è line_total (per gli ordini senza è stato calcolato come prezzo × quantità al riempimento).
import { isRevenue } from './revenue.js';

export const COMPLETED_ITEMS = `
  FROM orders o
  JOIN order_items i ON i.order_id = o.id
  LEFT JOIN products p ON p.id = i.product_id
  WHERE ${isRevenue('o')}`;
export const LINE_REVENUE = 'i.line_total';
