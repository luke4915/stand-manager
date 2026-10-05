// Cosa può fare ogni ruolo in Sala. Solo per nascondere i comandi: i permessi veri li controlla il server.
// Il cameriere prende gli ordini, manda le portate e serve; incassare, stornare, scontare e unire i conti
// restano ai ruoli di cassa (backend: CASH_ROLES, DISCOUNT_ROLES).
const CASH = ['admin', 'responsabile', 'cassa'];
export const canCash = (role) => CASH.includes(role);
export const canDiscount = (role) => ['admin', 'responsabile'].includes(role);
