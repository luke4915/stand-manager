import { useState } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import PanelFrame from './PanelFrame';
import CoversStepper from './CoversStepper';
import { btnPrimary } from './ui';

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
      <CoversStepper value={covers} onChange={setCovers} />
    </PanelFrame>
  );
};

export default OpenTablePanel;
