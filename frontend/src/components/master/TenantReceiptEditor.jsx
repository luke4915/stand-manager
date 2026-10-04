import { useState, useEffect } from 'react';
import { X, Save, ImagePlus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { brandingFromSettings, imagesFromSettings } from '../../print/branding';
import { buildCopyPreviews } from '../../print/copyPreviews';
import { createBrowserImages } from '../../print/raster';
import { DEFAULT_BRANDING } from '../../print/templates';
import { toBlackWhiteDataUrl } from './blackWhiteImage';

// Personalizzazione degli scontrini di un tenant (solo master): testi, logo, immagine laterale
// e anteprima delle copie con gli stessi template che stampano davvero.
const TEXT_FIELDS = [
  { key: 'receipt_org_name', label: 'Nome organizzazione', placeholder: 'Es. Pro Loco di Esempio' },
  { key: 'receipt_org_tax_code', label: 'Codice fiscale / P. IVA', placeholder: 'Es. C.F. 01234567890' },
  { key: 'receipt_title', label: 'Titolo del documento', placeholder: DEFAULT_BRANDING.title },
  { key: 'receipt_total_label', label: 'Etichetta del totale', placeholder: DEFAULT_BRANDING.totalLabel, max: 50 },
  { key: 'receipt_item_header', label: 'Titolo colonna articoli', placeholder: DEFAULT_BRANDING.itemHeader, max: 30 },
  { key: 'receipt_amount_header', label: 'Titolo colonna importi', placeholder: DEFAULT_BRANDING.amountHeader, max: 30 },
];
const IMAGES = [
  { key: 'receipt_logo', label: 'Logo', hint: 'In cima alle copie. Larghezza massima 512 px.', maxWidth: 512 },
  { key: 'receipt_side_image', label: 'Immagine laterale', hint: 'Ai lati del numero ordine. Larghezza massima 250 px.', maxWidth: 250 },
];

const inputClass = 'w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]';
const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1';

const TenantReceiptEditor = ({ tenant, onClose }) => {
  const [values, setValues] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [activeCopy, setActiveCopy] = useState(0);

  useEffect(() => {
    apiFetch(`/master/tenants/${tenant.id}/receipt`).then(setValues).catch(err => setError(err.message));
  }, [tenant.id]);

  const set = (key, value) => { setValues(v => ({ ...v, [key]: value })); setSaved(false); };

  // L'anteprima si rigenera a ogni modifica
  useEffect(() => {
    if (!values) return;
    let cancelled = false;
    buildCopyPreviews(brandingFromSettings(values), createBrowserImages(imagesFromSettings(values)))
      .then(p => { if (!cancelled) setPreviews(p); })
      .catch(err => { if (!cancelled) setError(`Anteprima non disponibile: ${err.message}`); });
    return () => { cancelled = true; };
  }, [values]);

  const handleImage = async (key, maxWidth, file) => {
    if (!file) return;
    setError('');
    try { set(key, await toBlackWhiteDataUrl(file, maxWidth)); }
    catch { setError('Immagine non leggibile: usa un PNG o un JPG.'); }
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await apiFetch(`/master/tenants/${tenant.id}/receipt`, { method: 'PUT', body: values });
      setSaved(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const copy = previews[Math.min(activeCopy, previews.length - 1)];

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-main)] overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Personalizza scontrini</p>
            <h2 className="text-xl font-black text-[var(--text-main)]">{tenant.name} <span className="text-sm font-normal text-[var(--text-muted)]">({tenant.slug})</span></h2>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={16} /></button>
        </div>

        {!values ? <p className="text-sm text-[var(--text-muted)]">{error || 'Caricamento...'}</p> : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {TEXT_FIELDS.map(({ key, label, placeholder, max = 100 }) => (
                  <label key={key}>
                    <span className={labelClass}>{label}</span>
                    <input className={inputClass} maxLength={max} placeholder={placeholder} value={values[key] || ''} onChange={e => set(key, e.target.value)} />
                  </label>
                ))}
              </div>
              <label className="block">
                <span className={labelClass}>Testo legale a fondo scontrino <span className="font-normal normal-case">(una riga per riga di stampa)</span></span>
                <textarea rows={4} maxLength={2000} className={`${inputClass} resize-none`} value={values.receipt_legal_text || ''} onChange={e => set('receipt_legal_text', e.target.value)}
                  placeholder="Es. Raccolta fondi occasionale ai sensi dell'art. 7 D.Lgs. 117/17" />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                {IMAGES.map(({ key, label, hint, maxWidth }) => (
                  <div key={key} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <span className={labelClass}>{label}</span>
                    <p className="text-[11px] text-[var(--text-muted)] mb-2">{hint}</p>
                    {values[key] && <img src={values[key]} alt={label} className="max-h-24 mb-2 bg-white border border-[var(--border)]" />}
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-[var(--bg-card-2)] text-[var(--text-main)]">
                        <ImagePlus size={12} /> {values[key] ? 'Cambia' : 'Carica'}
                        <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { handleImage(key, maxWidth, e.target.files[0]); e.target.value = ''; }} />
                      </label>
                      {values[key] && (
                        <button onClick={() => set(key, null)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10">
                          <Trash2 size={12} /> Togli
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {error && <p className="text-red-500 text-xs font-black uppercase tracking-widest">{error}</p>}
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-60">
                <Save size={14} /> {saving ? 'Salvataggio...' : saved ? 'Salvato ✓' : 'Salva'}
              </button>
              <p className="text-[11px] text-[var(--text-muted)]">Le casse ricevono le modifiche al prossimo avvio o al ritorno della rete.</p>
            </div>

            <div>
              <span className={labelClass}>Anteprima</span>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {previews.map((p, i) => (
                  <button key={p.name} onClick={() => setActiveCopy(i)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${i === activeCopy ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
              <pre className="p-4 rounded-xl bg-white text-black text-[11px] leading-[1.35] overflow-x-auto border border-[var(--border)] font-mono">{copy?.text}</pre>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">Le immagini compaiono come segnaposto con le dimensioni. Ordine di esempio.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantReceiptEditor;
