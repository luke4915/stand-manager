import { useMemo } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import UsersPanel from '../shared/UsersPanel';

// Utenti di un tenant visti dal master: elenco, creazione, cambio ruolo/username, password temporanea, eliminazione.
const TenantUsers = ({ tenant, onClose, onChanged }) => {
  const api = useMemo(() => {
    const base = `/master/tenants/${tenant.id}/users`;
    // dopo ogni modifica il pannello aggiorna anche il conteggio utenti dell'elenco tenant
    const changed = async (promise) => { const result = await promise; onChanged?.(); return result; };
    return {
      list: () => apiFetch(base),
      create: (body) => changed(apiFetch(base, { method: 'POST', body })),
      update: (id, body) => changed(apiFetch(`${base}/${id}`, { method: 'PATCH', body })),
      remove: (id) => changed(apiFetch(`${base}/${id}`, { method: 'DELETE' })),
      resetPassword: (id, password) => apiFetch(`${base}/${id}/reset-password`, { method: 'POST', body: { password } }),
    };
  }, [tenant.id, onChanged]);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-main)] overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Utenti</p>
            <h2 className="text-xl font-black text-[var(--text-main)]">{tenant.name} <span className="text-sm font-normal text-[var(--text-muted)]">({tenant.slug})</span></h2>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={16} /></button>
        </div>
        <UsersPanel api={api} />
      </div>
    </div>
  );
};

export default TenantUsers;
