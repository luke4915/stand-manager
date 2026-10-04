// Catalogo dei moduli e dei tipi di attività: unica fonte di verità per backend, validazione e pannello master
// (che lo legge da GET /master/catalog). Un modulo nuovo si aggiunge qui e si applica con requireModule.
//
// Il nucleo (login, utenti, prodotti, ordini, sessioni, stampa, impostazioni) non è un modulo: c'è sempre.

export const MODULES = {
  kds: 'Schermo cucina (KDS)',
  stats: 'Statistiche',
  qr_menu: 'Menu pubblico con QR',
  tables: 'Sala e tavoli',
};

// Il tipo di attività propone i moduli di partenza; poi il master può accenderne o spegnerne.
export const BUSINESS_TYPES = {
  sagra: { label: 'Sagra o evento', modules: ['kds', 'stats', 'qr_menu'] },
  paninaro: { label: 'Paninaro o food truck', modules: ['stats', 'qr_menu'] },
  ristorante: { label: 'Ristorante o pizzeria', modules: ['kds', 'stats', 'tables'] },
};

export const MODULE_IDS = Object.keys(MODULES);
export const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES);

// Ritorna i moduli in ordine di catalogo e senza doppioni.
export const normalizeModules = (modules) => MODULE_IDS.filter(id => modules.includes(id));

export const catalog = () => ({
  modules: MODULE_IDS.map(id => ({ id, label: MODULES[id] })),
  businessTypes: BUSINESS_TYPE_IDS.map(id => ({ id, ...BUSINESS_TYPES[id] })),
});
