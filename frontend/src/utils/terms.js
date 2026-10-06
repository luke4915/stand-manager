// Le parole del lavoro cambiano col tipo di locale: una sagra ha le «serate», un ristorante i «servizi» (pranzo, cena).
// La sessione è la stessa cosa lato server; qui cambia solo come si chiama sullo schermo.
const TERMS = {
  serata: {
    unit: 'serata', total: 'Totale serata', filter: 'Filtra per sessione',
    h2h: 'Confronto prodotto tra serate (head to head)', pickA: 'Serata A…', pickB: 'Serata B…', defaultA: 'Serata A', defaultB: 'Serata B',
    selectTwo: 'Seleziona un prodotto e due serate da confrontare.', column: 'Sessione', none: 'Nessuna sessione conclusa disponibile.',
    all: 'Tutte le sessioni', endTitle: 'Terminare Sessione?',
  },
  servizio: {
    unit: 'servizio', total: 'Totale servizio', filter: 'Filtra per servizio',
    h2h: 'Confronto prodotto tra servizi (head to head)', pickA: 'Servizio A…', pickB: 'Servizio B…', defaultA: 'Servizio A', defaultB: 'Servizio B',
    selectTwo: 'Seleziona un prodotto e due servizi da confrontare.', column: 'Servizio', none: 'Nessun servizio concluso disponibile.',
    all: 'Tutti i servizi', endTitle: 'Chiudere il servizio?',
  },
};

export const termsFor = (businessType) => (businessType === 'ristorante' ? TERMS.servizio : TERMS.serata);
export const TERM_SETS = TERMS;
