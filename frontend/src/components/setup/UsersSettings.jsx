import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useAuth } from '../../context/useAuth';
import UsersPanel from '../shared/UsersPanel';

// Utenti del proprio tenant (solo admin).
const UsersSettings = () => {
  const { user } = useAuth();
  const api = useMemo(() => ({
    list: () => fetchWithAuth('/auth/admin/users'),
    create: (body) => fetchWithAuth('/auth/admin/createUser', { method: 'POST', body }),
    update: (id, body) => fetchWithAuth(`/auth/admin/users/${id}`, { method: 'PATCH', body }),
    remove: (id) => fetchWithAuth(`/auth/admin/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id, password) => fetchWithAuth(`/auth/admin/users/${id}/reset-password`, { method: 'POST', body: { password } }),
  }), []);

  return (
    <div className="bg-[var(--bg-card)] p-5 rounded-xl border border-[var(--border)]">
      <h2 className="text-sm font-semibold text-[var(--text-main)] mb-4 flex items-center gap-2">
        <Users size={15} /> Utenti
      </h2>
      <UsersPanel api={api} currentUserId={user.id} />
    </div>
  );
};

export default UsersSettings;
