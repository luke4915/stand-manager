import { useEffect, useState } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import EndSessionModal from './EndSessionModal';
import CashCountModal from './CashCountModal';

// Chiusura della sessione in due passi:
// 1. conferma (e scelta su eventuali ordini ancora aperti) con EndSessionModal;
// 2. conteggio del contante con CashCountModal, confrontato col totale atteso dal server.
// `onConfirm(contanteDichiarato, sceltaOrdiniAperti)` chiude la sessione sul server.
const CloseSessionFlow = ({ sessionName, onCancel, onConfirm }) => {
  const [step, setStep] = useState('confirm'); // 'confirm' | 'count'
  const [expectedCash, setExpectedCash] = useState(0);
  const [openOrdersInfo, setOpenOrdersInfo] = useState({ count: 0, total: 0 });
  const [openOrdersAction, setOpenOrdersAction] = useState(undefined); // 'complete' | 'leave'

  useEffect(() => {
    fetchWithAuth('/sessions/expected-cash')
      .then(data => {
        setExpectedCash(data.expected || 0);
        setOpenOrdersInfo({ count: data.openOrders || 0, total: data.openOrdersTotal || 0 });
      })
      .catch(() => { setExpectedCash(0); setOpenOrdersInfo({ count: 0, total: 0 }); });
  }, []);

  if (step === 'confirm') return (
    <EndSessionModal
      sessionName={sessionName}
      openOrders={openOrdersInfo.count}
      openOrdersTotal={openOrdersInfo.total}
      onCancel={onCancel}
      onConfirm={(choice) => { setOpenOrdersAction(choice); setStep('count'); }}
    />
  );

  return (
    <CashCountModal
      expectedCash={expectedCash + (openOrdersAction === 'complete' ? openOrdersInfo.total : 0)}
      onClose={onCancel}
      onConfirm={(declaredCash) => onConfirm(declaredCash, openOrdersAction)}
    />
  );
};

export default CloseSessionFlow;
