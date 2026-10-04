// Quali ruoli vedono quali pagine. Vale per il menu laterale e per le route: nascondere la voce non basta,
// perché l'URL (o la PWA riaperta sull'ultima pagina) porterebbe comunque lì. Le autorizzazioni vere sono sul server.
export const VIEW_ROLES = {
  dashboard: ['admin', 'responsabile', 'cassa'],
  kitchen: ['admin', 'cucina'],
  statistics: ['admin', 'responsabile'],
  config: ['admin'],
  setup: ['admin', 'responsabile', 'cassa'],
};

export const canView = (role, view) => VIEW_ROLES[view]?.includes(role) ?? false;

export const defaultView = (role) => (role === 'cucina' ? 'kitchen' : 'dashboard');
