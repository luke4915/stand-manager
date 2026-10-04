// Ruoli degli utenti, con l'etichetta mostrata in interfaccia (stessi valori di ROLES nel backend).
export const ROLE_OPTIONS = [
  { value: 'cassa', label: 'Cassa' },
  { value: 'cucina', label: 'Cucina' },
  { value: 'responsabile', label: 'Responsabile' },
  { value: 'admin', label: 'Admin' },
];

export const roleLabel = (role) => ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;
