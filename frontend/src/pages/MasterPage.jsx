import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, LogOut, Building2, Users, Clock, Power, Trash2, Plus, Printer, Blocks } from 'lucide-react';
import { apiFetch, ApiError } from '../utils/apiClient';
import TenantReceiptEditor from '../components/master/TenantReceiptEditor';
import TenantUsers from '../components/master/TenantUsers';
import ModulePicker from '../components/master/ModulePicker';
import TenantModules from '../components/master/TenantModules';
import TempPasswordField from '../components/shared/TempPasswordField';

const StatCard = ({ label, value }) => (
  <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{label}</p>
    <p className="text-2xl font-black text-[var(--text-main)]">{value}</p>
  </div>
);

const licenseStatus = (t) => {
  if (!t.active) return { label: 'Disattivato', dot: 'bg-gray-400' };
  if (!t.expires_at) return { label: 'Nessuna scadenza', dot: 'bg-blue-500' };
  const daysLeft = (new Date(t.expires_at) - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return { label: 'Scaduto', dot: 'bg-red-500' };
  if (daysLeft < 2) return { label: `Scade tra ${Math.ceil(daysLeft * 24)}h`, dot: 'bg-orange-500' };
  return { label: `Attivo · ${Math.ceil(daysLeft)}g`, dot: 'bg-green-500' };
};

const inputClass = "p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]";
const iconBtnClass = "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest hover:bg-[var(--bg-card-2)] transition-all";

// ─── Modale conferma eliminazione (stesso stile di ClearCartModal) ───
const DeleteTenantModal = ({ tenant, onConfirm, onClose }) => {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <p className="font-black text-[var(--text-main)] mb-1 text-center">Eliminare "{tenant.name}"?</p>
        <p className="text-xs text-[var(--text-muted)] mb-4 text-center">
          Azione irreversibile: cancella anche prodotti, ordini e utenti. Digita <b>{tenant.slug}</b> per confermare.
        </p>
        <input
          autoFocus
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder={tenant.slug}
          className={`${inputClass} w-full mb-4`}
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-black text-xs uppercase tracking-widest hover:bg-[var(--bg-card-2)] transition-all">Annulla</button>
          <button
            onClick={() => typed === tenant.slug && onConfirm()}
            disabled={typed !== tenant.slug}
            className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest transition-all"
          >
            Elimina
          </button>
        </div>
      </div>
    </div>
  );
};

const MasterPage = () => {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [receiptTarget, setReceiptTarget] = useState(null);
  const [usersTarget, setUsersTarget] = useState(null);
  const [modulesTarget, setModulesTarget] = useState(null);
  const [catalog, setCatalog] = useState(null);

  const emptyForm = { slug: '', name: '', plan: 'trial', expiresInDays: 7, adminUsername: '', adminPassword: '', businessType: 'sagra', modules: ['kds', 'stats', 'qr_menu'] };
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const loadTenants = useCallback(async () => {
    try {
      setTenants(await apiFetch('/master/tenants'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuthed(false);
      else setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadTenants();
    apiFetch('/master/catalog').then(setCatalog).catch(err => setError(err.message));
  }, [authed, loadTenants]);

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      await apiFetch('/master/login', { method: 'POST', body: { password } });
      setAuthed(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleLogout = async () => {
    await apiFetch('/master/logout', { method: 'POST' }).catch(() => {});
    setAuthed(false); setPassword(''); setTenants([]);
  };

  const handleCreateTenant = async () => {
    setCreating(true); setError('');
    try {
      await apiFetch('/master/tenants', { method: 'POST', body: form });
      setForm(emptyForm);
      loadTenants();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const handleExtend = async (id, days) => {
    setError('');
    try {
      await apiFetch(`/master/tenants/${id}/extend`, { method: 'PATCH', body: { days } });
      loadTenants();
    } catch (err) { setError(err.message); }
  };

  const handleToggleActive = async (id, active) => {
    setError('');
    try {
      await apiFetch(`/master/tenants/${id}/active`, { method: 'PATCH', body: { active } });
      loadTenants();
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async () => {
    setError('');
    try {
      await apiFetch(`/master/tenants/${deleteTarget.id}`, { method: 'DELETE', body: { confirmSlug: deleteTarget.slug } });
      setDeleteTarget(null);
      loadTenants();
    } catch (err) { setError(err.message); }
  };

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-main)]">
        <ShieldCheck size={40} className="text-[var(--accent)] mb-3" />
        <h1 className="text-xl font-black mb-1 text-[var(--text-main)]">Area Riservata</h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-6">Master Panel</p>
        <div className="flex flex-col gap-4 w-80">
          <input
            type="password"
            placeholder="Password master"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className={inputClass}
            autoFocus
          />
          {error && <p className="text-red-500 text-xs font-black uppercase tracking-widest text-center">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className={`w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-[var(--accent)]/30 transition-all ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {loading ? "Accesso..." : "Entra"}
          </button>
        </div>
      </div>
    );
  }

  const activeCount = tenants.filter(t => t.active).length;
  const expiringSoon = tenants.filter(t => {
    if (!t.active || !t.expires_at) return false;
    const days = (new Date(t.expires_at) - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days < 3;
  }).length;

  return (
    <div className="h-screen overflow-y-auto bg-[var(--bg-main)]">
      <div className="max-w-2xl mx-auto p-6 sm:p-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} className="text-[var(--accent)]" />
            <h1 className="text-xl font-black text-[var(--text-main)]">Master Panel</h1>
          </div>
          <button onClick={handleLogout} className={iconBtnClass}>
            <LogOut size={13} /> Esci
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard label="Tenant totali" value={tenants.length} />
          <StatCard label="Attivi" value={activeCount} />
          <StatCard label="In scadenza (&lt;3g)" value={expiringSoon} />
        </div>

        <div className="bg-[var(--bg-card)] rounded-2xl p-5 mb-8 border border-[var(--border)]">
          <h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-4 flex items-center gap-1.5">
            <Plus size={13} /> Nuovo tenant
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input placeholder="slug (es. prova)" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className={inputClass} />
            <input placeholder="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
            <input placeholder="Piano" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} className={inputClass} />
            <input type="number" placeholder="Giorni licenza" value={form.expiresInDays} onChange={e => setForm(f => ({ ...f, expiresInDays: Number(e.target.value) }))} className={inputClass} />
            <input placeholder="Username admin" value={form.adminUsername} onChange={e => setForm(f => ({ ...f, adminUsername: e.target.value }))} className={inputClass} />
            <TempPasswordField className={`${inputClass} w-full`} value={form.adminPassword} onChange={adminPassword => setForm(f => ({ ...f, adminPassword }))} />
          </div>
          {catalog && (
            <div className="mb-4">
              <ModulePicker catalog={catalog} value={{ businessType: form.businessType, modules: form.modules }} onChange={v => setForm(f => ({ ...f, ...v }))} />
            </div>
          )}
          {error && <p className="text-red-500 text-xs font-black uppercase tracking-widest mb-3">{error}</p>}
          <button
            onClick={handleCreateTenant}
            disabled={creating}
            className={`px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all ${creating ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {creating ? "Creazione..." : "Crea tenant"}
          </button>
        </div>

        <h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
          <Building2 size={13} /> Tenant esistenti
        </h2>
        <div className="space-y-2 pb-8">
          {tenants.map(t => {
            const status = licenseStatus(t);
            return (
              <div key={t.id} className="p-4 bg-[var(--bg-card-2)] rounded-xl border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                  <span className="font-black text-sm text-[var(--text-main)]">{t.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">({t.slug})</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mb-3">
                  <span>{t.plan}</span>
                  <span className="flex items-center gap-1"><Users size={11} /> {t.user_count}</span>
                  <span>{status.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] mb-3">
                  <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-black uppercase tracking-widest text-[10px]">
                    {catalog?.businessTypes.find(b => b.id === t.business_type)?.label ?? t.business_type}
                  </span>
                  {t.modules?.map(id => (
                    <span key={id} className="px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">{catalog?.modules.find(m => m.id === id)?.label ?? id}</span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleExtend(t.id, 7)} className={iconBtnClass}>
                    <Clock size={12} /> +7g
                  </button>
                  <button onClick={() => handleExtend(t.id, 30)} className={iconBtnClass}>
                    <Clock size={12} /> +30g
                  </button>
                  <button onClick={() => handleToggleActive(t.id, !t.active)} className={iconBtnClass}>
                    <Power size={12} /> {t.active ? 'Disattiva' : 'Riattiva'}
                  </button>
                  <button onClick={() => catalog && setModulesTarget(t)} className={iconBtnClass}>
                    <Blocks size={12} /> Moduli
                  </button>
                  <button onClick={() => setUsersTarget(t)} className={iconBtnClass}>
                    <Users size={12} /> Utenti
                  </button>
                  <button onClick={() => setReceiptTarget(t)} className={iconBtnClass}>
                    <Printer size={12} /> Scontrini
                  </button>
                  <button
                    onClick={() => setDeleteTarget(t)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 text-red-500 font-black text-[10px] uppercase tracking-widest hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 size={12} /> Elimina
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modulesTarget && catalog && <TenantModules tenant={modulesTarget} catalog={catalog} onClose={() => setModulesTarget(null)} onSaved={loadTenants} />}

      {usersTarget && <TenantUsers tenant={usersTarget} onClose={() => setUsersTarget(null)} onChanged={loadTenants} />}

      {receiptTarget && <TenantReceiptEditor tenant={receiptTarget} onClose={() => setReceiptTarget(null)} />}

      {deleteTarget && (
        <DeleteTenantModal
          tenant={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
};

export default MasterPage;
