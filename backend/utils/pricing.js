// ─── Pricing helper condiviso (backend) ──────────────────────────────
// Specchia 1:1 la logica del frontend (frontend/src/utils/pricing.js).
// Unica fonte di verità server-side per il calcolo del prezzo effettivo
// di una riga carrello, in base al tipo di adjustment applicato.
//
// item.type: 'sale' | 'gift' | 'discount'
// item.discountMode: 'percent' | 'amount'   (rilevante solo se type === 'discount')
// item.discountValue: number

export const VALID_TYPES = ['sale', 'gift', 'discount'];
export const VALID_DISCOUNT_MODES = ['percent', 'amount'];

/**
 * Calcola il prezzo effettivo (addebitato) di una riga a partire dal
 * prezzo di listino (originalPrice) e dall'adjustment richiesto.
 * Il risultato è sempre clampato in [0, originalPrice].
 */
export function computeEffectivePrice(originalPrice, { type, discountMode, discountValue } = {}) {
    const base = Number(originalPrice) || 0;

    if (type === 'gift') return 0;

    if (type === 'discount') {
        const val = Number(discountValue) || 0;
        if (discountMode === 'amount') {
            return Math.max(0, +(base - val).toFixed(2));
        }
        // default: percentuale
        const pct = Math.min(100, Math.max(0, val));
        return Math.max(0, +(base * (1 - pct / 100)).toFixed(2));
    }

    return base;
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