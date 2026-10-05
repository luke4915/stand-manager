// Dalla riga di un ordine, già verificata dal server (`items[i]` di routes/orders.js), alla riga di `order_items`.
// Funzione pura. Non inventa dati: dove la riga non è come ce la si aspetta la normalizza nel modo più prudente e lo
// segnala in `anomalies`; se non si può rappresentare (quantità non valida) ritorna `row: null` e chi scrive annulla l'ordine.

const LINE_TYPES = ['sale', 'gift', 'discount'];
const PRINT_DESTINATIONS = ['bar', 'kitchen', 'both'];

const finite = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const round2 = (n) => Math.round(n * 100) / 100;

export function toOrderItemRow(item, position) {
  const anomalies = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { row: null, anomalies: ['riga_non_valida'] };

  const quantity = Number(item.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) return { row: null, anomalies: ['quantita_non_valida'] };

  const rawId = item.id;
  const idNumber = finite(rawId);
  const productId = idNumber !== null && Number.isSafeInteger(idNumber) && idNumber > 0 ? idNumber : null;
  if (rawId === undefined || rawId === null || rawId === '') anomalies.push('id_mancante');
  else if (productId === null) anomalies.push('id_non_valido');

  const name = typeof item.name === 'string' ? item.name : '';
  if (!name.trim()) anomalies.push('nome_mancante');

  let unitPrice = finite(item.price);
  if (unitPrice === null) { anomalies.push('prezzo_mancante'); unitPrice = 0; }

  // Gli ordini più vecchi non hanno line_total: vale prezzo × quantità, come nelle statistiche.
  const lineTotal = finite(item.line_total) ?? round2(unitPrice * quantity);

  const type = item.type ?? 'sale';
  const lineType = LINE_TYPES.includes(type) ? type : 'sale';
  if (!LINE_TYPES.includes(type)) anomalies.push('tipo_non_valido');

  const destination = item.print_destination ?? null;
  const printDestination = PRINT_DESTINATIONS.includes(destination) ? destination : null;
  if (destination !== null && printDestination === null) anomalies.push('destinazione_non_valida');

  return {
    row: {
      position,
      product_id: productId,
      name,
      category: typeof item.category === 'string' ? item.category : null,
      print_destination: printDestination,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      original_price: finite(item.original_price),
      line_type: lineType,
      discount_mode: typeof item.discountMode === 'string' ? item.discountMode : null,
      discount_value: finite(item.discountValue),
      note: typeof item.note === 'string' ? item.note : '',
      modifiers: JSON.stringify(Array.isArray(item.modifiers) ? item.modifiers : []),
    },
    anomalies,
  };
}

// Tutte le righe di un ordine.
export function toOrderItemRows(items) {
  if (!Array.isArray(items)) return { rows: [], anomalies: ['items_non_array'] };

  const rows = [];
  const anomalies = [];
  items.forEach((item, position) => {
    const result = toOrderItemRow(item, position);
    anomalies.push(...result.anomalies);
    if (result.row) rows.push(result.row);
  });
  return { rows, anomalies };
}
