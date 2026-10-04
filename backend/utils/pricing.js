// Pricing: unica fonte di verità del prezzo di una riga (vedi il commento sotto).
// Specchio 1:1 di frontend/src/utils/pricing.js: se cambi uno, cambia l'altro.
// ─── Calcolo del prezzo di una riga ─────────────────────────────────
// Funzione unica e identica in backend/utils/pricing.js e frontend/src/utils/pricing.js
// (la parità è verificata da backend/tests/pricing.test.js): quello che la cassa mostra e
// stampa è quello che il server registra. Tutto in centesimi interi, arrotondato una volta
// sola sul totale di riga.
//
// adjustment.type: 'sale' | 'gift' | 'discount'
// adjustment.discountMode: 'percent' | 'amount' (solo se type === 'discount')
// adjustment.discountValue: percentuale, oppure euro da togliere all'INTERA riga

export const VALID_TYPES = ['sale', 'gift', 'discount'];
export const VALID_DISCOUNT_MODES = ['percent', 'amount'];

const toCents = (euro) => Math.round((Number(euro) || 0) * 100);

/**
 * Totale effettivo (in euro, 2 decimali) di una riga: prezzo di listino × quantità,
 * meno omaggio o sconto. Sempre in [0, listino × quantità].
 */
export function computeLineTotal(listPrice, quantity, { type, discountMode, discountValue } = {}) {
    const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
    const gross = toCents(listPrice) * qty;

    if (type === 'gift') return 0;

    if (type === 'discount') {
        const val = Math.max(0, Number(discountValue) || 0);
        if (discountMode === 'amount') return Math.max(0, gross - toCents(val)) / 100;
        const pct = Math.min(100, val);
        return Math.round(gross * (100 - pct) / 100) / 100;
    }

    return gross / 100;
}

/**
 * Normalizza e valida l'adjustment ricevuto dal client.
 * Ritorna sempre un oggetto "sicuro" con soli i campi ammessi;
 * se authorized === false, forza sempre 'sale' (nessuno sconto/omaggio).
 */
export function sanitizeAdjustment(rawItem, authorized) {
    if (!authorized) return { type: 'sale', discountMode: null, discountValue: null };

    const type = VALID_TYPES.includes(rawItem?.type) ? rawItem.type : 'sale';
    if (type !== 'discount') return { type, discountMode: null, discountValue: null };

    const discountMode = VALID_DISCOUNT_MODES.includes(rawItem?.discountMode) ? rawItem.discountMode : 'percent';
    let discountValue = Number(rawItem?.discountValue);
    if (!Number.isFinite(discountValue) || discountValue < 0) discountValue = 0;
    if (discountMode === 'percent') discountValue = Math.min(100, discountValue);

    return { type, discountMode, discountValue };
}
