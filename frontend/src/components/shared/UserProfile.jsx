import { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../../context/useToast'
import { useAuth } from '../../context/useAuth';

import { API_URL } from '../../config/api';
const UserProfile = ({ onClose }) => {
  const { user, login } = useAuth();
  const { showToast } = useToast();

  const [username, setUsername] = useState(user.username);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('cassa');
  const [isCreating, setIsCreating] = useState(false);

  const inputClass = "w-full p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const labelClass = "block text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1";

  const handleSave = async () => {
    try {
      if (username !== user.username) {
        const res = await fetch(`${API_URL}/profile/username`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newUsername: username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Errore aggiornamento username");
        login({ ...user, username });
      }

      if (newPassword) {
        if (!oldPassword) return showToast("Inserisci la vecchia password", "error");
        if (newPassword !== confirmPassword) return showToast("Le password non coincidono", "error");
        const res = await fetch(`${API_URL}/auth/change-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ userId: user.id, oldPassword, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Errore aggiornamento password");
      }

      showToast("Profilo aggiornato", "success");
      onClose();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return showToast("Inserisci un nome utente", "error");
    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/auth/admin/createUser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: newUserName, role: newUserRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore creazione utente");
      showToast(`Utente "${data.user.username}" creato`, "success");
      setNewUserName('');
      setShowCreateUser(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-[var(--bg-card)] p-8 rounded-3xl shadow-2xl w-full max-w-md border border-[var(--border)]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-black tracking-tighter text-[var(--text-main)]">Profilo</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-0.5">{user.role}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-card-2)] transition-colors">
            <X size={18} className="text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="space-y-3">
          <div><label className={labelClass}>Username</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Vecchia password</label><input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Nuova password</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Conferma password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} /></div>
        </div>

        {user.role === 'admin' && !showCreateUser && (
          <button onClick={() => setShowCreateUser(true)} className="w-full mt-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-500/20 transition-all">
            Crea nuovo utente
          </button>
        )}

        {showCreateUser && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Nuovo utente</p>
            <input type="text" placeholder="Username" value={newUserName} onChange={e => setNewUserName(e.target.value)} className={inputClass} />
            <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} className={inputClass}>
              <option value="cassa">Cassa</option>
              <option value="cucina">Cucina</option>
              <option value="responsabile">Responsabile</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-3">
              <button onClick={handleCreateUser} disabled={isCreating} className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50">
                {isCreating ? 'Creazione...' : 'Crea'}
              </button>
              <button onClick={() => setShowCreateUser(false)} className="flex-1 py-2.5 bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                Annulla
              </button>
            </div>
          </div>
        )}

        {!showCreateUser && (
          <div className="flex gap-3 mt-6">
            <button onClick={handleSave} className="flex-1 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-[var(--accent-shadow)] transition-all">Salva</button>
            <button onClick={onClose} className="flex-1 py-2.5 bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] rounded-xl font-black text-xs uppercase tracking-widest transition-all">Chiudi</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;