import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import ModulePicker from './ModulePicker';

// Tipo di attività e moduli di un tenant esistente. Vale subito: gli utenti lo vedono al prossimo accesso o rinnovo.
const TenantModules = ({ tenant, catalog, onClose, onSaved }) => {
  const [value, setValue] = useState({ businessType: tenant.business_type, modules: tenant.modules });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await apiFetch(`/master/tenants/${tenant.id}/modules`, { method: 'PUT', body: { modules: value.modules } });
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Moduli</p>
            <h2 className="text-lg font-black text-[var(--text-main)]">{tenant.name} <span className="text-sm font-normal text-[var(--text-muted)]">({tenant.slug})</span></h2>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 rounded-xl hover:bg-[var(--bg-card-2)]"><X size={16} className="text-[var(--text-muted)]" /></button>
        </div>
        <ModulePicker catalog={catalog} value={value} onChange={setValue} typeLocked />
        {error && <p className="text-red-500 text-xs font-bold mt-3">{error}</p>}
        <button onClick={save} disabled={saving}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50">
          <Save size={14} /> {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  );
};

export default TenantModules;
