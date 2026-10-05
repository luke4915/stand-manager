// Calcoli della schermata del conto. Servono solo ad anteprime (resto, quote, totale del carrello): gli importi veri
// li calcola sempre il server e la schermata li rilegge dopo ogni operazione.

export const toCents = (euro) => Math.round(Number(euro) * 100);
export const formatEuro = (euro) => `${Number(euro).toFixed(2).replace('.', ',')} €`;

// Stato del tavolo: libero, occupato o conto richiesto (non si memorizza: lo dice il conto aperto).
export const tableState = (check) => (!check ? 'free' : check.bill_requested_at ? 'bill' : 'busy');

// Divide un importo in `parts` quote uguali al centesimo: le prime ricevono il centesimo in più, e la somma è esatta.
export function splitEqually(euro, parts) {
  const cents = toCents(euro);
  const n = Math.max(1, Math.trunc(parts));
  const base = Math.floor(cents / n), extra = cents % n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

// Righe ancora da pagare del conto (comande non annullate, con quantità residua e importo residuo > 0).
export function payableLines(detail) {
  return detail.orders
    .filter(o => o.status !== 'canceled')
    .flatMap(o => o.items.map(i => ({ ...i, order_code: o.display_code })))
    .filter(i => i.line_id !== null && i.remaining_quantity > 0 && i.remaining_amount > 0);
}

// Stima dell'importo delle voci scelte ({ [line_id]: quantità }), con la stessa regola del server:
// quota proporzionale e l'ultima quota di una riga prende il resto.
export function estimateSelection(lines, selection) {
  let cents = 0;
  for (const line of lines) {
    const q = selection[line.line_id] ?? 0;
    if (q <= 0) continue;
    const left = toCents(line.remaining_amount);
    cents += q >= line.remaining_quantity ? left : Math.min(left, Math.round(left * q / line.remaining_quantity));
  }
  return cents / 100;
}

// Totale di un carrello (anteprima: il server ricalcola dal catalogo).
export const cartTotal = (cart) => cart.reduce((sum, i) => sum + toCents(i.price) * i.quantity, 0) / 100;

// Aggiunge un prodotto al carrello della comanda (stesso prodotto, stessa nota, stessa portata e stesse opzioni = stessa
// riga), rispettando lo stock. `modifiers` = opzioni scelte `[{ id, name, price }]`: il prezzo della riga le comprende
// (anteprima: il server ricalcola dal catalogo).
const sameModifiers = (a = [], b = []) => a.length === b.length && a.every(m => b.some(n => n.id === m.id));

export function addToCart(cart, product, quantity = 1, modifiers = []) {
  const inCart = cart.filter(i => i.id === product.id).reduce((s, i) => s + i.quantity, 0);
  if (product.stock_enabled && product.stock !== null && inCart + quantity > product.stock) return { cart, blocked: true };
  const courseId = product.course_id ?? null;
  const existing = cart.find(i => i.id === product.id && !i.note && (i.course_id ?? null) === courseId && sameModifiers(i.modifiers, modifiers));
  const extra = modifiers.reduce((sum, m) => sum + toCents(m.price), 0) / 100;
  const next = existing
    ? cart.map(i => (i === existing ? { ...i, quantity: i.quantity + quantity } : i))
    : [...cart, { id: product.id, name: product.name, price: Number(product.price) + extra, quantity, note: '', print_destination: product.print_destination || 'both', category: product.category || null, course_id: courseId, modifiers }];
  return { cart: next, blocked: false };
}

export const normalizeText = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
