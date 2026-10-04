// Catalogo dei moduli e dei tipi di attività: unica fonte di verità per backend, validazione e pannello master
// (che lo legge da GET /master/catalog). Un modulo nuovo si aggiunge qui e si applica con requireModule.
//
// Il nucleo (login, utenti, prodotti, ordini, sessioni, stampa, impostazioni) non è un modulo: c'è sempre.

// Un locale è di un solo tipo, deciso alla creazione: sagra e ristorante sono due prodotti distinti (due app,
// stesso backend). Ogni modulo dichiara per quali tipi esiste; un tipo non può accendere i moduli degli altri.
const ALL_TYPES = ['sagra', 'paninaro', 'ristorante'];
export const MODULES = {
  kds: { label: 'Schermo cucina (KDS)', types: ALL_TYPES },
  stats: { label: 'Statistiche', types: ALL_TYPES },
  qr_menu: { label: 'Menu pubblico con QR', types: ['sagra', 'paninaro'] },
  tables: { label: 'Sala e tavoli', types: ['ristorante'] },
};

// Il tipo di attività propone i moduli di partenza; poi il master può accendere o spegnere quelli che esistono per il tipo.
export const BUSINESS_TYPES = {
  sagra: { label: 'Sagra o evento', modules: ['kds', 'stats', 'qr_menu'] },
  paninaro: { label: 'Paninaro o food truck', modules: ['stats', 'qr_menu'] },
  ristorante: { label: 'Ristorante o pizzeria', modules: ['kds', 'stats', 'tables'] },
};

export const MODULE_IDS = Object.keys(MODULES);
export const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES);

// Ritorna i moduli in ordine di catalogo e senza doppioni.
export const normalizeModules = (modules) => MODULE_IDS.filter(id => modules.includes(id));

// Moduli che esistono per un tipo di attività.
export const modulesForType = (businessType) => MODULE_IDS.filter(id => MODULES[id].types.includes(businessType));

// Primo modulo non ammesso per il tipo, o undefined se vanno bene tutti.
export const firstModuleNotAllowed = (businessType, modules) => modules.find(id => !MODULES[id]?.types.includes(businessType));

export const catalog = () => ({
  modules: MODULE_IDS.map(id => ({ id, label: MODULES[id].label, types: MODULES[id].types })),
  businessTypes: BUSINESS_TYPE_IDS.map(id => ({ id, ...BUSINESS_TYPES[id] })),
});
