// Pricing: serve a mostrare in tempo reale il totale in cassa e a comporre lo scontrino;
// il valore registrato resta quello ricalcolato dal server.
// Specchio 1:1 di backend/utils/pricing.js: se cambi uno, cambia l'altro.
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

/** Totale di una riga carrello (prezzo di listino in `price`, adjustment sull'item). */
export function getLineTotal(item) {
    return computeLineTotal(item?.price, item?.quantity, item);
}

/** Prezzo unitario effettivo (solo per la visualizzazione: il riferimento è getLineTotal). */
export function getEffectivePrice(item) {
    const qty = Number(item?.quantity) || 0;
    return qty > 0 ? getLineTotal(item) / qty : 0;
}

/** Somma dei prezzi di listino (pre-sconto) del carrello. */
export function getFullTotal(cart) {
    return cart.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
}

/** Somma dei totali di riga (post-sconto/omaggio): quello da incassare davvero. */
export function getDiscountedTotal(cart) {
    const cents = cart.reduce((sum, i) => sum + Math.round(getLineTotal(i) * 100), 0);
    return cents / 100;
}

/** Etichetta breve da mostrare accanto a una riga scontata/omaggiata. */
export function getAdjustmentLabel(item) {
    if (item?.type === 'gift') return 'OMAGGIO';
    if (item?.type === 'discount') {
        const val = Number(item.discountValue) || 0;
        return item.discountMode === 'amount' ? `-${val.toFixed(2)}€` : `-${val}%`;
    }
    return null;
}
