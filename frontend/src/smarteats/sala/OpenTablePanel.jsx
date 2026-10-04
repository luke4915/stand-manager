import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import PanelFrame from './PanelFrame';
import { btn, btnPrimary, label } from './ui';

// Un tavolo libero: si scelgono i coperti e si apre il conto, nello stesso pannello del conto.
const OpenTablePanel = ({ table, onBack, onOpened, onBusy }) => {
  const { showToast } = useToast();
  const [covers, setCovers] = useState(table.seats);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try { onOpened(await fetchWithAuth('/checks', { method: 'POST', body: { table_id: table.id, covers } })); }
    catch (err) {
      showToast(err.message, 'error');
      if (err.code === 'TABLE_BUSY') onBusy(); // lo ha aperto qualcun altro un istante prima
    } finally { setBusy(false); }
  };

  return (
    <PanelFrame title={table.name} subtitle={`Libero · ${table.seats} posti`} onBack={onBack}
      footer={<button className={`${btnPrimary} w-full !py-4`} disabled={busy} onClick={open}>{busy ? 'Apertura…' : 'Apri tavolo'}</button>}>
      <div className="h-full flex flex-col items-center justify-center gap-4 py-8">
        <p className={label}>Coperti</p>
        <div className="flex items-center gap-6">
          <button className={`${btn} !p-4`} aria-label="Meno coperti" disabled={covers <= 0} onClick={() => setCovers(c => Math.max(0, c - 1))}><Minus size={20} /></button>
          <span className="text-6xl font-black tabular-nums text-[var(--text-main)] w-24 text-center" aria-live="polite">{covers}</span>
          <button className={`${btn} !p-4`} aria-label="Più coperti" disabled={covers >= 99} onClick={() => setCovers(c => Math.min(99, c + 1))}><Plus size={20} /></button>
        </div>
      </div>
    </PanelFrame>
  );
};

export default OpenTablePanel;
