import { useState } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import PanelFrame from './PanelFrame';
import CoversStepper from './CoversStepper';
import { btnPrimary } from './ui';

// Cambio dei coperti di un conto aperto (il coperto, se previsto, si adegua da solo).
const CoversView = ({ detail, onBack, onDone }) => {
  const { showToast } = useToast();
  const [covers, setCovers] = useState(detail.covers);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await fetchWithAuth(`/checks/${detail.id}/covers`, { method: 'POST', body: { covers } });
      await onDone();
      onBack();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <PanelFrame title="Coperti" subtitle={detail.table_name} onBack={onBack}
      footer={<button className={`${btnPrimary} w-full !py-4`} disabled={busy || covers === detail.covers} onClick={save}>{busy ? 'Salvataggio…' : 'Salva'}</button>}>
      <CoversStepper value={covers} onChange={setCovers} />
    </PanelFrame>
  );
};

export default CoversView;
