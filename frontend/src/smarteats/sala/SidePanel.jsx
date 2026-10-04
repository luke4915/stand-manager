import { useState, useCallback } from 'react';
import { LayoutGrid } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { printCheckReceipt } from '../../print/checkReceipt';
import { useCheckDetail } from './useCheckDetail';
import OpenTablePanel from './OpenTablePanel';
import CheckView from './CheckView';
import PayView from './PayView';
import AdjustView from './AdjustView';
import MoveView from './MoveView';
import CoversView from './CoversView';
import DraftOrder from './DraftOrder';

const Empty = () => (
  <div className="h-full flex flex-col items-center justify-center gap-2 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] text-[var(--text-muted)] opacity-60">
    <LayoutGrid size={32} />
    <p className="text-sm text-center font-black uppercase tracking-widest">Scegli un tavolo</p>
  </div>
);

// Il conto di un tavolo e le sue viste (conto, incasso, sconto, comanda): sempre nello stesso pannello.
const CheckSide = ({ checkId, user, service, event, ordering, cart, setCart, products, onBack, onDraftBack, onOrder, onSent, onChanged, onSwitch }) => {
  const { showToast } = useToast();
  const [view, setView] = useState('check');      // 'check' | 'pay' | 'adjust' | 'move' | 'covers'
  const { detail, reload } = useCheckDetail(checkId, event, onBack);
  const refresh = useCallback(async () => { await reload(); onChanged(); }, [reload, onChanged]);

  const print = async (paymentId = null) => {
    try {
      const receipt = await fetchWithAuth(`/checks/${checkId}/receipt${paymentId ? `?payment_id=${paymentId}` : ''}`);
      const queued = await printCheckReceipt(receipt);
      showToast(queued ? 'Ricevuta in stampa' : 'Nessuna stampante configurata', queued ? 'success' : 'warning');
    } catch (err) { showToast(`Errore di stampa: ${err.message}`, 'error'); }
  };

  if (!detail) return null;
  if (ordering) return <DraftOrder detail={detail} service={service} cart={cart} setCart={setCart} products={products} onBack={onDraftBack} onSent={() => { onSent(); refresh(); }} />;
  if (view === 'pay') return <PayView detail={detail} onBack={() => setView('check')} onPaid={refresh} onPrint={print} />;
  if (view === 'adjust') return <AdjustView detail={detail} onBack={() => setView('check')} onDone={refresh} />;
  if (view === 'covers') return <CoversView detail={detail} onBack={() => setView('check')} onDone={refresh} />;
  if (view === 'move') {
    return <MoveView detail={detail} onBack={() => setView('check')} onMoved={(check) => onSwitch(check)} onMerged={(target) => onSwitch(target)} />;
  }
  return (
    <CheckView detail={detail} user={user} service={service} onBack={onBack} onOrder={onOrder} onPay={() => setView('pay')} onAdjust={() => setView('adjust')} onMove={() => setView('move')} onCovers={() => setView('covers')}
      onChanged={refresh} onDeleted={() => { onChanged(); onBack(); }} onPrint={print} />
  );
};

const SidePanel = ({ selection, onBack, onOpened, onBusy, ...rest }) => {
  if (!selection) return <Empty />;
  if (!selection.checkId) return <OpenTablePanel table={selection.table} onBack={onBack} onOpened={onOpened} onBusy={onBusy} />;
  // `key`: cambiando conto le viste (incasso, sconto) ripartono da zero
  return <CheckSide key={selection.checkId} checkId={selection.checkId} onBack={onBack} {...rest} />;
};

export default SidePanel;
