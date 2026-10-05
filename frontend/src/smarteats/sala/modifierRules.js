// Scelta delle opzioni di un piatto (modificatori) in comanda: regole dei gruppi e anteprima del supplemento.
// È solo l'anteprima: il server ricontrolla tutto e ricalcola il prezzo (POST /checks/:id/courses).
// `group` = { id, name, min_select, max_select (null = senza limite), options: [{ id, name, price_delta }] };
// `selected` = array di id di opzioni.

// Un gruppo a scelta singola (massimo 1) sostituisce l'opzione scelta; con più scelte si accende e si spegne,
// fino al massimo del gruppo (oltre non si aggiunge).
export function toggleOption(selected, group, optionId) {
  if (selected.includes(optionId)) return selected.filter(id => id !== optionId);
  const mine = group.options.map(o => o.id);
  if (group.max_select === 1) return [...selected.filter(id => !mine.includes(id)), optionId];
  const count = selected.filter(id => mine.includes(id)).length;
  return group.max_select !== null && count >= group.max_select ? selected : [...selected, optionId];
}

export const countIn = (selected, group) => group.options.filter(o => selected.includes(o.id)).length;

// Tutti i minimi rispettati: si può aggiungere il piatto.
export const isComplete = (selected, groups) => groups.every(g => countIn(selected, g) >= g.min_select);

// Cosa manca, per dirlo a chi sta ordinando («Cottura»).
export const missingGroups = (selected, groups) => groups.filter(g => countIn(selected, g) < g.min_select);

// Supplemento totale in euro, al centesimo.
export const extraOf = (selected, groups) =>
  Math.round(groups.flatMap(g => g.options).filter(o => selected.includes(o.id)).reduce((s, o) => s + Math.round(o.price_delta * 100), 0)) / 100;

// Le scelte come righe del carrello, nell'ordine dei gruppi.
export const toLineModifiers = (selected, groups) =>
  groups.flatMap(g => g.options.filter(o => selected.includes(o.id)).map(o => ({ id: o.id, name: o.name, price: o.price_delta })));

// Suggerimento sotto il nome del gruppo.
export function groupHint(group) {
  if (group.max_select === 1) return group.min_select >= 1 ? 'Scegli una' : 'Facoltativo, una sola';
  if (group.min_select >= 1) return group.max_select === null ? `Scegli almeno ${group.min_select}` : `Da ${group.min_select} a ${group.max_select}`;
  return group.max_select === null ? 'Facoltativo' : `Facoltativo, fino a ${group.max_select}`;
}
