import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useToast } from '../../context/useToast';
import { fetchWithAuth } from '../../utils/apiClient';
import { refreshPrintConfig } from '../../print/config';
import { DEFAULT_BRANDING } from '../../print/templates';

// Testi degli scontrini del tenant. Un campo lasciato vuoto usa il valore predefinito
// (nome, codice fiscale e testo legale, se vuoti, non vengono stampati).
const FIELDS = [
    { key: 'receipt_org_name', label: 'Nome organizzazione', hint: 'Intestazione dello scontrino', placeholder: 'Es. Pro Loco di Esempio' },
    { key: 'receipt_org_tax_code', label: 'Codice fiscale / P. IVA', hint: 'Sotto il nome', placeholder: 'Es. C.F. 01234567890' },
    { key: 'receipt_title', label: 'Titolo del documento', placeholder: DEFAULT_BRANDING.title },
    { key: 'receipt_item_header', label: 'Titolo colonna articoli', placeholder: DEFAULT_BRANDING.itemHeader },
    { key: 'receipt_amount_header', label: 'Titolo colonna importi', placeholder: DEFAULT_BRANDING.amountHeader },
    { key: 'receipt_total_label', label: 'Etichetta del totale', placeholder: DEFAULT_BRANDING.totalLabel },
    { key: 'receipt_legal_text', label: 'Testo legale a fondo scontrino', hint: 'Una riga per riga di stampa (facoltativo)', multiline: true, placeholder: 'Es. Raccolta fondi occasionale ai sensi dell\'art. 7 D.Lgs. 117/17' },
];

const inputClass = 'w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all';

const ReceiptSettings = () => {
    const { showToast } = useToast();
    const [values, setValues] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchWithAuth('/settings/all')
            .then(setValues)
            .catch(err => showToast(`Errore caricamento scontrino: ${err.message}`, 'error'))
            .finally(() => setLoading(false));
    }, [showToast]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await Promise.all(FIELDS.map(({ key }) =>
                fetchWithAuth(`/settings/${key}`, { method: 'PUT', body: { value: values[key]?.trim() || null } })));
            await refreshPrintConfig().catch(() => { /* offline: si aggiorna al ritorno della rete */ });
            showToast('Scontrino salvato!', 'success');
        } catch (err) {
            showToast(`Errore salvataggio: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border)]">
            <h3 className="font-black text-[var(--text-main)] uppercase tracking-tight mb-1">Scontrino</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">Intestazione, titoli e testi legali stampati sulle copie</p>
            <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map(({ key, label, hint, placeholder, multiline }) => (
                    <label key={key} className={multiline ? 'sm:col-span-2' : ''}>
                        <span className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                            {label} {hint && <span className="font-normal opacity-60">({hint})</span>}
                        </span>
                        {multiline ? (
                            <textarea rows={3} maxLength={2000} className={`${inputClass} resize-none`} placeholder={placeholder}
                                value={loading ? '' : values[key] || ''} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />
                        ) : (
                            <input type="text" maxLength={100} className={inputClass} placeholder={placeholder}
                                value={loading ? '' : values[key] || ''} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />
                        )}
                    </label>
                ))}
            </div>
            <button
                onClick={handleSave}
                disabled={saving || loading}
                className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60"
            >
                <Save size={14} /> {saving ? 'Salvataggio...' : 'Salva'}
            </button>
        </div>
    );
};

export default ReceiptSettings;
