// Pagine dell'app SmartEats (ristoranti e pizzerie): chi le vede dipende dal ruolo e dai moduli del locale.
// Come in components/layout/viewRoles.js, vale per il menu e per le route; le autorizzazioni vere sono sul server.
export const VIEWS = [
  { id: 'sala', label: 'Sala', roles: ['admin', 'responsabile', 'cassa'] },
  { id: 'cucina', label: 'Cucina', roles: ['admin', 'cucina'], module: 'kds' },
  { id: 'carta', label: 'Carta', roles: ['admin'] },
  { id: 'statistiche', label: 'Statistiche', roles: ['admin', 'responsabile'], module: 'stats' },
  { id: 'impostazioni', label: 'Impostazioni', roles: ['admin'] },
];

// `modules` mancante = utente salvato in cache offline: non si nasconde nulla finché il server non risponde.
export const visibleViews = (role, modules) =>
  VIEWS.filter(v => v.roles.includes(role) && (!v.module || !modules || modules.includes(v.module)));

export const canViewSmartEats = (role, viewId, modules) => visibleViews(role, modules).some(v => v.id === viewId);

// Prima pagina disponibile, o null se il ruolo non ne ha (es. cucina senza il modulo KDS).
export const smartEatsHome = (role, modules) => visibleViews(role, modules)[0]?.id ?? null;

// Solo i locali di tipo ristorante usano questa app; le sagre e i paninari usano quella della cassa.
export const usesSmartEats = (user) => user?.businessType === 'ristorante';
