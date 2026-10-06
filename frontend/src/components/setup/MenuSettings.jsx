import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useToast } from '../../context/useToast';
import { apiFetch, fetchWithAuth } from '../../utils/apiClient';

const MenuSettings = () => {
    const { showToast } = useToast();
    const [welcomeMessage, setWelcomeMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Stesso endpoint pubblico letto dal menu con QR.
        apiFetch('/settings')
            .then(data => setWelcomeMessage(data.welcome_message || ''))
            .catch(err => showToast(`Errore caricamento messaggio: ${err.message}`, 'error'))
            .finally(() => setLoading(false));
    }, [showToast]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetchWithAuth('/settings/welcome_message', { method: 'PUT', body: { value: welcomeMessage } });
            showToast('Messaggio salvato!', 'success');
        } catch (err) {
            showToast(`Errore salvataggio: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-[var(--bg-card)] p-6 rounded-xl border border-[var(--border)]">
            <h3 className="font-semibold text-[var(--text-main)] tracking-tight mb-1">Menu Pubblico</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">Messaggio di benvenuto mostrato ai clienti</p>
            <textarea
                value={loading ? '' : welcomeMessage}
                onChange={e => setWelcomeMessage(e.target.value)}
                placeholder="Es. Benvenuto alla Sagra del Calzone 2026! Scegli i tuoi prodotti..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all resize-none"
            />
            <button
                onClick={handleSave}
                disabled={saving}
                className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold text-xs transition-all disabled:opacity-60"
            >
                <Save size={14} /> {saving ? 'Salvataggio...' : 'Salva'}
            </button>
        </div>
    );
};

export default MenuSettings;