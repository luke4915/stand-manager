import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Save, ImagePlus, Trash2, RotateCcw, Building2, FileText, Image as ImageIcon, Scale, Check, CircleAlert, Printer } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { brandingFromSettings, imagesFromSettings } from '../../print/branding';
import { buildCopyPreviews } from '../../print/copyPreviews';
import { createBrowserImages } from '../../print/raster';
import { DEFAULT_BRANDING } from '../../print/templates';
import { toBlackWhiteDataUrl } from './blackWhiteImage';

// Personalizzazione degli scontrini di un tenant (solo master): testi, logo, immagine laterale
// e anteprima delle copie con gli stessi template che stampano davvero.
// Un campo vuoto torna al predefinito, che si vede come suggerimento nel campo.
const SECTIONS = [
  {
    id: 'identity', title: 'Intestazione', icon: Building2,
    hint: 'Chi emette lo scontrino: compare in cima alle copie.',
    fields: [
      { key: 'receipt_org_name', label: 'Nome organizzazione', placeholder: 'Es. Pro Loco di Esempio', max: 100, wide: true },
      { key: 'receipt_org_tax_code', label: 'Codice fiscale / P. IVA', placeholder: 'Es. C.F. 01234567890', max: 100 },
      { key: 'receipt_title', label: 'Titolo del documento', placeholder: DEFAULT_BRANDING.title, max: 100 },
    ],
  },
  {
    id: 'body', title: 'Dettaglio ordine', icon: FileText,
    hint: 'Le intestazioni delle colonne e la dicitura del totale.',
    fields: [
      { key: 'receipt_item_header', label: 'Colonna articoli', placeholder: DEFAULT_BRANDING.itemHeader, max: 30 },
      { key: 'receipt_amount_header', label: 'Colonna importi', placeholder: DEFAULT_BRANDING.amountHeader, max: 30 },
      { key: 'receipt_total_label', label: 'Dicitura del totale', placeholder: DEFAULT_BRANDING.totalLabel, max: 50 },
    ],
  },
];
const IMAGES = [
  { key: 'receipt_logo', label: 'Logo', hint: 'In cima alle copie, a tutta larghezza (max 512 px).', maxWidth: 512 },
  { key: 'receipt_side_image', label: 'Immagine laterale', hint: 'Ai lati del numero ordine (max 250 px).', maxWidth: 250 },
];
const LEGAL = { key: 'receipt_legal_text', max: 2000 };
const ALL_KEYS = [...SECTIONS.flatMap(s => s.fields.map(f => f.key)), ...IMAGES.map(i => i.key), LEGAL.key];

const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]/70';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]';
const ghostBtn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] hover:bg-[var(--bg-card-2)] transition-colors cursor-pointer';

// Un valore vuoto e uno assente sono la stessa cosa: tornano al predefinito.
const snapshotOf = (values) => JSON.stringify(ALL_KEYS.map(k => String(values?.[k] ?? '').trim() || null));
const kb = (dataUrl) => Math.max(1, Math.round((dataUrl.length * 3 / 4) / 1024));

// Disegna un raster a 1 bit (bit acceso = nero) come uscirebbe dalla stampante.
const RasterImage = ({ width, height, b64 }) => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const perRow = Math.ceil(width / 8);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const black = bytes[y * perRow + (x >> 3)] & (0x80 >> (x % 8));
        const i = (y * width + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = black ? 0 : 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [width, height, b64]);
  return <canvas ref={ref} width={width} height={height} className="block w-full h-auto" style={{ imageRendering: 'pixelated' }} />;
};

const Section = ({ icon, title, hint, children }) => {
  const Icon = icon;
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="p-2 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><Icon size={16} /></span>
        <div>
          <h3 className="text-sm font-black text-[var(--text-main)]">{title}</h3>
          <p className="text-xs text-[var(--text-muted)]">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
};

const TextField = ({ field, value, onChange }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <label htmlFor={field.key} className={labelClass}>{field.label}</label>
      {value && (
        <button type="button" onClick={() => onChange('')} title="Ripristina il predefinito"
          className="flex items-center gap-1 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)]">
          <RotateCcw size={10} /> Predefinito
        </button>
      )}
    </div>
    <input id={field.key} className={inputClass} maxLength={field.max} placeholder={field.placeholder} value={value} onChange={e => onChange(e.target.value)} />
  </div>
);

const TenantReceiptEditor = ({ tenant, onClose }) => {
  const [values, setValues] = useState(null);
  const [initial, setInitial] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [activeCopy, setActiveCopy] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    apiFetch(`/master/tenants/${tenant.id}/receipt`)
      .then(v => { setValues(v); setInitial(snapshotOf(v)); })
      .catch(err => setError(err.message));
  }, [tenant.id]);

  const dirty = values !== null && snapshotOf(values) !== initial;
  const set = (key, value) => { setValues(v => ({ ...v, [key]: value })); setJustSaved(false); };

  // L'anteprima si rigenera a ogni modifica, con le stesse immagini e gli stessi template della stampa.
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

  const handleSave = useCallback(async () => {
    if (!values || saving) return;
    setSaving(true); setError('');
    try {
      await apiFetch(`/master/tenants/${tenant.id}/receipt`, { method: 'PUT', body: values });
      setInitial(snapshotOf(values));
      setJustSaved(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }, [values, saving, tenant.id]);

  const requestClose = useCallback(() => { if (dirty) setConfirmClose(true); else onClose(); }, [dirty, onClose]);

  // Cmd/Ctrl+S salva, Esc chiude (chiedendo conferma se ci sono modifiche).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) handleSave(); }
      else if (e.key === 'Escape' && !confirmClose) requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, handleSave, requestClose, confirmClose]);

  const copy = previews[Math.min(activeCopy, previews.length - 1)];
  const legalLength = values?.[LEGAL.key]?.length ?? 0;
  const status = useMemo(() => {
    if (saving) return { label: 'Salvataggio…', tone: 'text-[var(--text-muted)]', icon: null };
    if (dirty) return { label: 'Modifiche non salvate', tone: 'text-orange-500', icon: CircleAlert };
    if (justSaved) return { label: 'Salvato', tone: 'text-green-500', icon: Check };
    return { label: 'Nessuna modifica', tone: 'text-[var(--text-muted)]', icon: null };
  }, [saving, dirty, justSaved]);
  const StatusIcon = status.icon;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-main)] flex flex-col">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <span className="p-2 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] hidden sm:block"><Printer size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className={labelClass}>Personalizza scontrini</p>
            <h2 className="text-base sm:text-lg font-black text-[var(--text-main)] truncate">
              {tenant.name} <span className="text-sm font-normal text-[var(--text-muted)]">({tenant.slug})</span>
            </h2>
          </div>
          <span className={`hidden sm:flex items-center gap-1.5 text-xs font-bold ${status.tone}`} role="status">
            {StatusIcon && <StatusIcon size={13} />} {status.label}
          </span>
          <button onClick={handleSave} disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <Save size={14} /> {saving ? 'Salvo…' : 'Salva'}
          </button>
          <button onClick={requestClose} aria-label="Chiudi" className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={16} /></button>
        </div>
        {error && values && <p className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 text-red-500 text-xs font-black">{error}</p>}
      </header>

      <div className="flex-1 overflow-y-auto">
        {!values ? (
          <p className="max-w-6xl mx-auto p-6 text-sm text-[var(--text-muted)]">{error || 'Caricamento…'}</p>
        ) : (
          <div className="max-w-6xl mx-auto p-4 sm:p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] items-start">
            <div className="space-y-4">
              {SECTIONS.map(({ id, title, icon, hint, fields }) => (
                <Section key={id} icon={icon} title={title} hint={hint}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {fields.map(field => (
                      <div key={field.key} className={field.wide ? 'sm:col-span-2' : ''}>
                        <TextField field={field} value={values[field.key] || ''} onChange={v => set(field.key, v)} />
                      </div>
                    ))}
                  </div>
                </Section>
              ))}

              <Section icon={ImageIcon} title="Immagini" hint="Si convertono in bianco e nero, come le vedrà la stampante.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {IMAGES.map(({ key, label, hint, maxWidth }) => (
                    <div key={key} className="p-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card-2)]">
                      <p className={labelClass}>{label}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mb-3">{hint}</p>
                      <div className="h-24 mb-3 rounded-lg bg-white border border-[var(--border)] flex items-center justify-center overflow-hidden">
                        {values[key]
                          ? <img src={values[key]} alt={label} className="max-h-full max-w-full object-contain" />
                          : <span className="text-[11px] text-neutral-400">Nessuna immagine</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className={ghostBtn}>
                          <ImagePlus size={12} /> {values[key] ? 'Cambia' : 'Carica'}
                          <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { handleImage(key, maxWidth, e.target.files[0]); e.target.value = ''; }} />
                        </label>
                        {values[key] && (
                          <>
                            <button onClick={() => set(key, null)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10">
                              <Trash2 size={12} /> Togli
                            </button>
                            <span className="ml-auto text-[10px] text-[var(--text-muted)]">{kb(values[key])} KB</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section icon={Scale} title="Testo legale" hint="A fondo scontrino, per esempio la dicitura sulla raccolta fondi. Una riga per riga di stampa.">
                <textarea rows={4} maxLength={LEGAL.max} aria-label="Testo legale" className={`${inputClass} resize-y`} value={values[LEGAL.key] || ''}
                  onChange={e => set(LEGAL.key, e.target.value)}
                  placeholder="Es. Raccolta fondi occasionale ai sensi dell'art. 7 D.Lgs. 117/17" />
                <p className={`text-[11px] mt-1 text-right ${legalLength > LEGAL.max * 0.9 ? 'text-orange-500' : 'text-[var(--text-muted)]'}`}>{legalLength} / {LEGAL.max}</p>
              </Section>

              <p className="text-[11px] text-[var(--text-muted)] pb-4">Le casse ricevono le modifiche al prossimo avvio o al ritorno della rete.</p>
            </div>

            <aside className="lg:sticky lg:top-6">
              <div className="flex items-center justify-between mb-2">
                <span className={labelClass}>Anteprima</span>
                <span className="text-[10px] text-[var(--text-muted)]">Ordine di esempio</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3" role="tablist">
                {previews.map((p, i) => (
                  <button key={p.name} role="tab" aria-selected={i === activeCopy} onClick={() => setActiveCopy(i)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${i === activeCopy ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl bg-[var(--bg-card-2)] p-4 border border-[var(--border)]">
                <div className="mx-auto bg-white text-black rounded-sm shadow-lg px-3 py-4 font-mono text-[10.5px] leading-[1.35] overflow-x-auto" style={{ maxWidth: '24.5rem' }}>
                  {copy?.parts.map((part, i) => part.image
                    ? <div key={i} className="my-1"><RasterImage {...part.image} /></div>
                    : <pre key={i} className="whitespace-pre m-0 font-mono">{part.text}</pre>)}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {confirmClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setConfirmClose(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <p className="font-black text-[var(--text-main)] mb-1 text-center">Uscire senza salvare?</p>
            <p className="text-xs text-[var(--text-muted)] mb-4 text-center">Le modifiche a testi e immagini andranno perse.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClose(false)} className="flex-1 h-10 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-black text-xs uppercase tracking-widest hover:bg-[var(--bg-card-2)]">Continua</button>
              <button onClick={onClose} className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-widest">Esci</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantReceiptEditor;
