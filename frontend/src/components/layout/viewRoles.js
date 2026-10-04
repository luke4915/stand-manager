// Quali pagine vede un utente: dipende dal ruolo e dai moduli accesi per il suo locale. Vale per il menu laterale
// e per le route: nascondere la voce non basta, perché l'URL (o la PWA riaperta sull'ultima pagina) porterebbe
// comunque lì. Le autorizzazioni vere sono sul server (ruoli e requireModule).
export const VIEW_ROLES = {
  dashboard: ['admin', 'responsabile', 'cassa'],
  kitchen: ['admin', 'cucina'],
  statistics: ['admin', 'responsabile'],
  config: ['admin'],
  setup: ['admin', 'responsabile', 'cassa'],
};

// Pagine che dipendono da un modulo; le altre fanno parte del nucleo e ci sono sempre.
export const VIEW_MODULES = {
  kitchen: 'kds',
  statistics: 'stats',
};

// `modules` mancante = utente salvato prima dei moduli (cache offline): non si nasconde nulla finché il
// server non risponde con l'elenco aggiornato.
export const canView = (role, view, modules) => {
  if (!VIEW_ROLES[view]?.includes(role)) return false;
  const required = VIEW_MODULES[view];
  return !required || !modules || modules.includes(required);
};

// Prima pagina disponibile per questo utente, o null se non ne ha nessuna (es. cucina senza il modulo KDS).
export const defaultView = (role, modules) =>
  ['dashboard', 'kitchen', 'statistics', 'setup', 'config'].find(view => canView(role, view, modules)) ?? null;
