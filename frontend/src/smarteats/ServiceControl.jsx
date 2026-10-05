import { useState } from 'react';
import { Power } from 'lucide-react';
import { useToast } from '../context/useToast';
import EndSessionModal from '../components/shared/EndSessionModal';
import CashCountModal from '../components/shared/CashCountModal';
import { termsFor } from '../utils/terms';

// Proposta di nome in base all'ora: pranzo fino alle 16, poi cena.
const suggestedName = () => {
  const now = new Date();
  return `${now.getHours() < 16 ? 'Pranzo' : 'Cena'} ${now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}`;
};

// Apertura e chiusura del servizio: pulsante in testata e finestre di conferma.
const ServiceControl = ({ service, canManage, start, closingInfo, end }) => {
  const { showToast } = useToast();
  const [step, setStep] = useState(null); // 'start' | 'end' | 'cash'
  const [name, setName] = useState('');
  const [info, setInfo] = useState({ expected: 0, openOrders: 0, openOrdersTotal: 0 });
  const [openOrdersAction, setOpenOrdersAction] = useState(undefined);

  if (service === undefined) return null;

  const begin = async () => {
    if (!service) { setName(suggestedName()); return setStep('start'); }
    let current = { expected: 0, openOrders: 0, openOrdersTotal: 0, openChecks: 0 };
    try { current = await closingInfo(); } catch { /* senza dati si prosegue: il server blocca comunque */ }
    // Conti aperti: i soldi non sono stati incassati, il server non lascia chiudere.
    if (current.openChecks > 0)
      return showToast(`Ci sono ${current.openChecks} conti aperti: incassali o annullali prima di chiudere il servizio`, 'warning');
    setInfo(current);
    setStep('end');
  };

  const submitStart = async (e) => {
    e.preventDefault();
    if (!name.trim()) return showToast('Inserisci un nome valido!', 'warning');
    try { await start(name.trim()); setStep(null); showToast(`Servizio "${name.trim()}" aperto`, 'success'); }
    catch (err) { showToast(err.message || 'Impossibile aprire il servizio', 'error'); }
  };

  const confirmEnd = async (declaredCash) => {
    setStep(null);
    try { await end(declaredCash, openOrdersAction); showToast('Servizio chiuso.', 'info'); }
    catch (err) { showToast(err.message || 'Impossibile chiudere il servizio', 'error'); }
  };

  return (
    <>
      <button onClick={canManage ? begin : undefined} disabled={!canManage}
        className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-semibold transition-all
          ${service ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}
          ${canManage ? 'cursor-pointer enabled:hover:opacity-80' : 'cursor-default'}`}>
        <Power size={16} className="pointer-events-none" />
        <span className="hidden sm:inline">{service ? `${service.name} · Chiudi` : 'Apri servizio'}</span>
      </button>

      {step === 'start' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-[2000] px-4 pb-4 sm:pb-0">
          <form onSubmit={submitStart} className="bg-[var(--bg-card)] p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md border border-[var(--border)] space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-[var(--text-main)]">Apri il servizio</h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">Senza un servizio aperto non si aprono i tavoli</p>
            </div>
            <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] font-medium focus:ring-2 focus:ring-[var(--accent)] outline-none" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(null)} className="flex-1 py-3 border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-bold">ANNULLA</button>
              <button type="submit" className="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold">APRI</button>
            </div>
          </form>
        </div>
      )}
      {step === 'end' && (
        <EndSessionModal title={termsFor('ristorante').endTitle} sessionName={service.name} openOrders={info.openOrders || 0} openOrdersTotal={info.openOrdersTotal || 0}
          onCancel={() => setStep(null)} onConfirm={(choice) => { setOpenOrdersAction(choice); setStep('cash'); }} />
      )}
      {step === 'cash' && (
        <CashCountModal expectedCash={(info.expected || 0) + (openOrdersAction === 'complete' ? info.openOrdersTotal || 0 : 0)}
          onClose={() => setStep(null)} onConfirm={confirmEnd} />
      )}
    </>
  );
};

export default ServiceControl;
