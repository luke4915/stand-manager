import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/apiClient';
import { useToast } from '../context/useToast';

// Coperto per persona (euro). Si fissa su ogni conto all'apertura: cambiarlo qui non tocca i conti già aperti.
const CoverSettings = () => {
  const { showToast } = useToast();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    fetchWithAuth('/settings/all')
      .then(s => { const v = s.cover_charge ? String(s.cover_charge).replace('.', ',') : ''; setValue(v); setSaved(v); })
      .catch(err => showToast(err.message, 'error'));
  }, [showToast]);

  const save = async () => {
    try {
      const res = await fetchWithAuth('/settings/cover_charge', { method: 'PUT', body: { value: value.trim() === '' ? null : value.trim() } });
      const v = res.value ? String(res.value).replace('.', ',') : '';
      setValue(v); setSaved(v);
      showToast('Coperto salvato', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  return (
    <div className="bg-[var(--bg-card)] p-5 rounded-2xl border border-[var(--border)]">
      <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-main)] mb-1">Coperto</h2>
      <p className="text-xs text-[var(--text-muted)] mb-4">Importo per persona, aggiunto al conto in base ai coperti. Lascia vuoto se non applichi il coperto.</p>
      <div className="flex gap-2 max-w-xs">
        <input className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent)]"
          inputMode="decimal" placeholder="Es. 2,50" aria-label="Coperto per persona in euro" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
        <button className="px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-black text-xs uppercase tracking-widest disabled:opacity-40" disabled={saved === null || value === saved} onClick={save}>Salva</button>
      </div>
    </div>
  );
};

export default CoverSettings;
