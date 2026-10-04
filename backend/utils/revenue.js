// Cosa conta come incasso: l'unica definizione, usata da statistiche, incasso atteso e CSV.
//
// Oggi un ordine è incasso quando è 'completed'. Con i conti dei tavoli la regola cambierà qui e solo qui
// (docs/design-tavoli.md, §4): chi scrive SQL sugli incassi usa `isRevenue()` invece di ripetere la condizione.
// Il test tests/revenue.test.js impedisce di riscrivere la regola a mano altrove.

// Condizione SQL per l'ordine con alias `alias`: ordini che fanno parte dell'incasso.
export const isRevenue = (alias = 'o') => `${alias}.status = 'completed'`;
