import { useState } from 'react';
import { useToast } from '../../context/useToast';
import { fetchWithAuth } from '../../utils/apiClient';

const ChangePassword = ({ onPasswordChanged }) => {
  const { showToast } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (!oldPassword || !newPassword.trim()) return showToast("Inserisci la password temporanea e la nuova password", "error");
    setLoading(true);
    try {
      await fetchWithAuth('/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } });
      showToast("Password impostata", "success");
      onPasswordChanged();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
      setOldPassword('');
      setNewPassword('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-main)]">
      <div className="bg-[var(--bg-card)] p-10 rounded-3xl shadow-xl border border-[var(--border)] w-full max-w-sm space-y-5">
        <div>
          <h2 className="text-2xl font-black tracking-tighter text-[var(--text-main)]">Imposta password</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">La password che ti hanno dato è temporanea: scegline una tua</p>
        </div>
        <input
          type="password"
          placeholder="Password temporanea"
          value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
          className="w-full p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <input
          type="password"
          placeholder="Nuova password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleChange()}
          className="w-full p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          onClick={handleChange}
          disabled={loading}
          className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-[var(--accent)]/20 transition-all disabled:opacity-50"
        >
          {loading ? "Salvataggio..." : "Imposta Password"}
        </button>
      </div>
    </div>
  );
};

export default ChangePassword;