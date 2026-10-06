import { useState } from 'react';
import { X, Eye, EyeOff, Check, Circle, UserRound, KeyRound, Building2 } from 'lucide-react';
import { useToast } from '../../context/useToast';
import { useAuth } from '../../context/useAuth';
import { fetchWithAuth } from '../../utils/apiClient';
import { roleLabel } from './roles';

// "Il mio account": username e password dell'utente collegato. Ogni parte si salva da sola,
// con i requisiti visibili mentre si scrive.
const MIN_PASSWORD = 8;

const inputClass = 'w-full p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]';
const labelClass = 'block text-xs font-semibold text-[var(--text-muted)] mb-1.5';
const primaryBtn = 'w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed';

const Card = ({ icon, title, children }) => {
  const Icon = icon;
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-[var(--text-main)] mb-3"><Icon size={14} className="text-[var(--accent)]" /> {title}</h3>
      {children}
    </section>
  );
};

const Rule = ({ ok, children }) => (
  <li className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-green-500' : 'text-[var(--text-muted)]'}`}>
    {ok ? <Check size={12} /> : <Circle size={10} />} {children}
  </li>
);

const PasswordInput = ({ label, value, onChange, show, autoComplete }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <input type={show ? 'text' : 'password'} autoComplete={autoComplete} className={inputClass} value={value} onChange={e => onChange(e.target.value)} />
  </label>
);

const UserProfile = ({ onClose }) => {
  const { user, login } = useAuth();
  const { showToast } = useToast();

  const [username, setUsername] = useState(user.username);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const trimmed = username.trim();
  const nameChanged = trimmed !== user.username;
  const longEnough = newPassword.length >= MIN_PASSWORD;
  const different = newPassword !== '' && newPassword !== oldPassword;
  const matches = newPassword !== '' && newPassword === confirmPassword;
  const canSavePassword = oldPassword !== '' && longEnough && different && matches;

  const saveUsername = async () => {
    setSavingName(true); setNameError('');
    try {
      const { username: saved } = await fetchWithAuth('/profile/username', { method: 'PATCH', body: { newUsername: trimmed } });
      login({ ...user, username: saved });
      setUsername(saved);
      showToast('Username aggiornato', 'success');
    } catch (err) {
      setNameError(err.message);
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    setSavingPassword(true); setPasswordError('');
    try {
      await fetchWithAuth('/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      showToast('Password aggiornata', 'success');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-card)] w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-xl shadow-2xl border border-[var(--border)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4 p-6 pb-4">
          <div className="w-14 h-14 rounded-xl bg-[var(--accent)] text-white text-2xl font-semibold flex items-center justify-center shrink-0">
            {user.username[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--text-main)] truncate">{user.username}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
              <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold">{roleLabel(user.role)}</span>
              {user.tenantName && <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] truncate"><Building2 size={12} /> {user.tenantName}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="self-start p-2 rounded-xl hover:bg-[var(--bg-card-2)] transition-colors"><X size={18} className="text-[var(--text-muted)]" /></button>
        </div>

        <div className="px-6 pb-6 grid gap-4 md:grid-cols-2 items-start">
          <Card icon={UserRound} title="Username">
            <input className={inputClass} aria-label="Username" maxLength={50} autoComplete="username" value={username}
              onChange={e => { setUsername(e.target.value); setNameError(''); }}
              onKeyDown={e => e.key === 'Enter' && nameChanged && trimmed && saveUsername()} />
            {nameError && <p className="text-red-500 text-xs font-bold mt-2">{nameError}</p>}
            <button className={`${primaryBtn} mt-3`} disabled={!nameChanged || !trimmed || savingName} onClick={saveUsername}>
              {savingName ? 'Salvataggio…' : 'Salva username'}
            </button>
          </Card>

          <Card icon={KeyRound} title="Password">
            <div className="space-y-3">
              <PasswordInput label="Password attuale" value={oldPassword} onChange={v => { setOldPassword(v); setPasswordError(''); }} show={showPasswords} autoComplete="current-password" />
              <PasswordInput label="Nuova password" value={newPassword} onChange={setNewPassword} show={showPasswords} autoComplete="new-password" />
              <PasswordInput label="Ripeti la nuova password" value={confirmPassword} onChange={setConfirmPassword} show={showPasswords} autoComplete="new-password" />
            </div>
            <button type="button" onClick={() => setShowPasswords(v => !v)} className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]">
              {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />} {showPasswords ? 'Nascondi le password' : 'Mostra le password'}
            </button>
            <ul className="mt-3 space-y-1">
              <Rule ok={longEnough}>Almeno {MIN_PASSWORD} caratteri</Rule>
              <Rule ok={different}>Diversa da quella attuale</Rule>
              <Rule ok={matches}>Le due nuove password coincidono</Rule>
            </ul>
            {passwordError && <p className="text-red-500 text-xs font-bold mt-3">{passwordError}</p>}
            <button className={`${primaryBtn} mt-3`} disabled={!canSavePassword || savingPassword} onClick={savePassword}>
              {savingPassword ? 'Salvataggio…' : 'Cambia password'}
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
