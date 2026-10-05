// Portate di una comanda: come le righe del carrello si dividono in gruppi, in che ordine escono e quali escono
// insieme. È solo l'anteprima della comanda: ordine d'uscita e totali veri li fissa il server (POST /checks/:id/courses).
//
// `plan` = { order: [chiavi] | null, together: { [chiave]: true } }. La chiave di un gruppo è l'id della portata,
// 0 per i piatti senza portata («Subito»: bevande, pane…). Senza `order` vale quello del locale, «Subito» per primo.

export const NO_COURSE_NAME = 'Subito';
export const emptyPlan = () => ({ order: null, together: {} });

const keyOf = (courseId) => courseId ?? 0;

// Chiavi dei gruppi presenti nella comanda, nell'ordine di uscita.
export function orderedKeys(cart, courses, plan) {
  const base = [0, ...courses.map(c => c.id)];
  const rank = plan.order ?? base;
  const position = (k) => { const i = rank.indexOf(k); return i === -1 ? rank.length + Math.max(base.indexOf(k), 0) : i; };
  return [...new Set(cart.map(l => keyOf(l.course_id)))].sort((a, b) => position(a) - position(b));
}

// Gruppi pronti da mostrare e da inviare. `seq` è il numero d'uscita: un gruppo «insieme» al precedente ha lo stesso.
export function buildGroups(cart, courses, plan) {
  let seq = 0;
  return orderedKeys(cart, courses, plan).map((key, i) => {
    const together = i > 0 && !!plan.together[key];
    if (!together) seq += 1;
    return {
      key, course_id: key || null, seq, together,
      name: key ? (courses.find(c => c.id === key)?.name ?? 'Portata') : NO_COURSE_NAME,
      lines: cart.filter(l => keyOf(l.course_id) === key),
    };
  });
}

// Sposta un gruppo prima (-1) o dopo (+1) degli altri.
export function moveGroup(cart, courses, plan, key, direction) {
  const keys = orderedKeys(cart, courses, plan);
  const from = keys.indexOf(key), to = from + direction;
  if (from === -1 || to < 0 || to >= keys.length) return plan;
  [keys[from], keys[to]] = [keys[to], keys[from]];
  const rest = [0, ...courses.map(c => c.id)].filter(k => !keys.includes(k));
  return { ...plan, order: [...keys, ...rest] };
}

export const toggleTogether = (plan, key) => ({ ...plan, together: { ...plan.together, [key]: !plan.together[key] } });

// Cosa si manda al server: per ogni riga solo id, quantità, nota, destinazione di stampa e id delle opzioni (prezzi e nomi li legge il server).
export const toPayload = (groups) => groups.map(g => ({
  course_id: g.course_id,
  seq: g.seq,
  items: g.lines.map(l => ({ id: l.id, name: l.name, quantity: l.quantity, note: l.note, print_destination: l.print_destination, modifiers: (l.modifiers ?? []).map(m => m.id) })),
}));

// Una riga del carrello con la portata del suo prodotto (se la portata esiste ancora e il locale ne usa).
export const courseOfProduct = (product, courses) => (courses.some(c => c.id === product.course_id) ? product.course_id : null);

// Riepilogo di cosa succede all'invio, per il pulsante: «Invia · Antipasti» e, sotto, cosa resta da mandare.
export function sendSummary(groups, fireFirst) {
  if (!groups.length) return { now: [], later: [] };
  if (!fireFirst) return { now: [], later: groups };
  const first = groups[0].seq;
  return { now: groups.filter(g => g.seq === first), later: groups.filter(g => g.seq !== first) };
}
