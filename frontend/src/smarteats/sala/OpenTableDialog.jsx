import { useState } from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import Modal from './Modal';
import { btnPrimary, btn, label } from './ui';

// Apertura di un tavolo libero: si indicano i coperti e si crea il conto.
const OpenTableDialog = ({ table, onClose, onOpened }) => {
  const { showToast } = useToast();
  const [covers, setCovers] = useState(table.seats);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const check = await fetchWithAuth('/checks', { method: 'POST', body: { table_id: table.id, covers } });
      onOpened(check);
    } catch (err) {
      showToast(err.message, 'error');
      // Il tavolo l'ha aperto qualcun altro un istante prima: si torna alla sala aggiornata
      if (err.code === 'TABLE_BUSY') onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Apri ${table.name}`} subtitle={`${table.seats} posti`} onClose={onClose}>
      <div className="p-6 space-y-6">
        <div>
          <p className={`${label} mb-3 flex items-center gap-1.5`}><Users size={12} /> Quanti coperti?</p>
          <div className="flex items-center justify-center gap-6">
            <button className={`${btn} !p-4`} aria-label="Meno coperti" disabled={covers <= 0} onClick={() => setCovers(c => Math.max(0, c - 1))}><Minus size={20} /></button>
            <span className="text-6xl font-black tabular-nums text-[var(--text-main)] w-24 text-center" aria-live="polite">{covers}</span>
            <button className={`${btn} !p-4`} aria-label="Più coperti" disabled={covers >= 99} onClick={() => setCovers(c => Math.min(99, c + 1))}><Plus size={20} /></button>
          </div>
        </div>
        <div className="flex gap-3">
          <button className={`${btn} flex-1`} onClick={onClose}>Annulla</button>
          <button className={`${btnPrimary} flex-1`} disabled={busy} onClick={open}>{busy ? 'Apertura…' : 'Apri tavolo'}</button>
        </div>
      </div>
    </Modal>
  );
};

export default OpenTableDialog;
