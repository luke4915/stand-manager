import { useState, useEffect, useCallback } from 'react';
import { UserPlus, KeyRound, Trash2, Pencil, Check, X, ShieldAlert } from 'lucide-react';
import { useToast } from '../../context/useToast';
import { ROLE_OPTIONS, roleLabel } from './roles';
import TempPasswordField from './TempPasswordField';

// Elenco e gestione degli utenti di un tenant: lo usano l'admin del tenant (Sistema) e il master (pannello tenant).
// `api` nasconde da dove arrivano i dati: { list, create, update, remove, resetPassword }.
// `currentUserId` (solo admin del tenant) impedisce di eliminarsi o cambiarsi il ruolo.
const inputClass = 'w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]';
const labelClass = 'block text-xs font-semibold text-[var(--text-muted)] mb-1';
const btnClass = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs hover:bg-[var(--bg-card-2)] transition-all disabled:opacity-50';
const dangerBtnClass = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 text-red-500 font-semibold text-xs hover:bg-red-500/10 transition-all disabled:opacity-50';
const primaryBtnClass = 'flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold text-xs transition-all disabled:opacity-50';

const EMPTY_NEW = { username: '', role: 'cassa', password: '' };

const UsersPanel = ({ api, currentUserId = null }) => {
  const { showToast } = useToast();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW);
  const [editing, setEditing] = useState(null);       // { id, username, role }
  const [resetting, setResetting] = useState(null);   // { id, password }
  const [deleting, setDeleting] = useState(null);     // utente da confermare

  const load = useCallback(async () => {
    try { setUsers(await api.list()); setError(''); }
    catch (err) { setError(err.message); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  // Esegue un'azione, mostra l'esito e ricarica l'elenco.
  const run = async (action, okMessage, onDone) => {
    setBusy(true);
    try {
      await action();
      showToast(okMessage, 'success');
      onDone?.();
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => run(
    () => api.create(newUser),
    `Utente "${newUser.username}" creato: dovrà cambiare la password al primo accesso`,
    () => { setNewUser(EMPTY_NEW); setCreating(false); }
  );

  const handleSaveEdit = () => {
    const original = users.find(u => u.id === editing.id);
    const changes = {};
    if (editing.username.trim() !== original.username) changes.username = editing.username.trim();
    if (editing.role !== original.role) changes.role = editing.role;
    if (!Object.keys(changes).length) return setEditing(null);
    return run(() => api.update(editing.id, changes), 'Utente aggiornato', () => setEditing(null));
  };

  const handleReset = () => run(
    () => api.resetPassword(resetting.id, resetting.password),
    'Password temporanea impostata: l\'utente dovrà cambiarla al primo accesso',
    () => setResetting(null)
  );

  const handleDelete = () => run(
    () => api.remove(deleting.id),
    `Utente "${deleting.username}" eliminato`,
    () => setDeleting(null)
  );

  if (!users) return <p className="text-sm text-[var(--text-muted)]">{error || 'Caricamento utenti...'}</p>;

  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="space-y-3">
      {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}

      <ul className="space-y-2">
        {users.map(u => {
          const isSelf = u.id === currentUserId;
          const isLastAdmin = u.role === 'admin' && adminCount === 1;
          const isEditing = editing?.id === u.id;
          const isResetting = resetting?.id === u.id;
          return (
            <li key={u.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)]">
              {isEditing ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label>
                    <span className={labelClass}>Username</span>
                    <input className={inputClass} maxLength={50} value={editing.username} onChange={e => setEditing(v => ({ ...v, username: e.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Ruolo</span>
                    <select className={inputClass} value={editing.role} disabled={isSelf || isLastAdmin}
                      title={isSelf ? 'Non puoi cambiare il tuo ruolo' : isLastAdmin ? 'Deve restare almeno un amministratore' : undefined}
                      onChange={e => setEditing(v => ({ ...v, role: e.target.value }))}>
                      {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button className={primaryBtnClass} disabled={busy || !editing.username.trim()} onClick={handleSaveEdit}><Check size={13} /> Salva</button>
                    <button className={btnClass} onClick={() => setEditing(null)} aria-label="Annulla"><X size={13} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-[var(--text-main)] truncate">
                      {u.username}{isSelf && <span className="ml-2 text-xs font-semibold text-[var(--accent)]">tu</span>}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {roleLabel(u.role)}
                      {!u.has_password && <span className="ml-2 text-orange-500 font-semibold">· senza password</span>}
                      {u.has_password && u.must_change_password && <span className="ml-2 text-orange-500 font-semibold">· password temporanea</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={btnClass} disabled={busy} onClick={() => { setResetting(null); setEditing({ id: u.id, username: u.username, role: u.role }); }}><Pencil size={12} /> Modifica</button>
                    <button className={btnClass} disabled={busy} onClick={() => { setEditing(null); setResetting({ id: u.id, password: '' }); }}><KeyRound size={12} /> Password</button>
                    <button className={dangerBtnClass} disabled={busy || isSelf || isLastAdmin}
                      title={isSelf ? 'Non puoi eliminare il tuo utente' : isLastAdmin ? 'Deve restare almeno un amministratore' : undefined}
                      onClick={() => setDeleting(u)}><Trash2 size={12} /> Elimina</button>
                  </div>
                </div>
              )}

              {isResetting && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label>
                    <span className={labelClass}>Nuova password temporanea (min 8 caratteri)</span>
                    <TempPasswordField className={inputClass} autoFocus value={resetting.password} onChange={password => setResetting(v => ({ ...v, password }))} />
                  </label>
                  <div className="flex gap-2">
                    <button className={primaryBtnClass} disabled={busy || resetting.password.length < 8} onClick={handleReset}>Imposta</button>
                    <button className={btnClass} onClick={() => setResetting(null)} aria-label="Annulla"><X size={13} /></button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {creating ? (
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] space-y-3">
          <p className={labelClass}>Nuovo utente</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr]">
            <input className={inputClass} placeholder="Username" maxLength={50} value={newUser.username} onChange={e => setNewUser(v => ({ ...v, username: e.target.value }))} />
            <TempPasswordField className={inputClass} value={newUser.password} onChange={password => setNewUser(v => ({ ...v, password }))} />
            <select className={inputClass} value={newUser.role} onChange={e => setNewUser(v => ({ ...v, role: e.target.value }))}>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">Scrivila o generala, poi comunicala all'utente: al primo accesso dovrà sceglierne una sua.</p>
          <div className="flex gap-2">
            <button className={primaryBtnClass} disabled={busy || !newUser.username.trim() || newUser.password.length < 8} onClick={handleCreate}>Crea utente</button>
            <button className={btnClass} onClick={() => { setCreating(false); setNewUser(EMPTY_NEW); }}>Annulla</button>
          </div>
        </div>
      ) : (
        <button className={btnClass} onClick={() => setCreating(true)}><UserPlus size={13} /> Nuovo utente</button>
      )}

      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setDeleting(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <ShieldAlert size={28} className="text-red-500 mx-auto mb-2" />
            <p className="font-semibold text-[var(--text-main)] mb-1 text-center">Eliminare "{deleting.username}"?</p>
            <p className="text-xs text-[var(--text-muted)] mb-4 text-center">Perderà subito l'accesso. Gli ordini già registrati restano.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)} className="flex-1 h-10 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs hover:bg-[var(--bg-card-2)]">Annulla</button>
              <button onClick={handleDelete} disabled={busy} className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-xs">Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPanel;
