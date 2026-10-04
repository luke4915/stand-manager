import { useState } from 'react';

// Conferma della chiusura serata. Se ci sono ordini ancora aperti (in attesa o in preparazione)
// l'admin sceglie: completarli (entrano nei conti) o lasciarli fuori da totale atteso e statistiche.
const EndSessionModal = ({ title = 'Terminare Sessione?', sessionName, openOrders, openOrdersTotal, onCancel, onConfirm }) => {
  const [choice, setChoice] = useState(null);
  const needsChoice = openOrders > 0;

  const optionClass = (value) => `w-full text-left p-3 rounded-2xl border transition-all ${choice === value
    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
    : 'border-[var(--border)] hover:bg-gray-500/10'}`;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-[2000] px-4 pb-4 sm:pb-0">
      <div className="bg-[var(--bg-card)] p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md text-center border border-[var(--border)] space-y-5">
        <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-500">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-7 h-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)]">{title}</h2>
          <p className="text-sm text-gray-400 mt-2">
            Stai per chiudere <span className="font-bold text-[var(--text-main)]">"{sessionName}"</span>.
          </p>
        </div>

        {needsChoice && (
          <div className="space-y-2 text-left">
            <p className="text-sm text-[var(--text-main)] text-center">
              Ci sono <span className="font-black">{openOrders}</span> {openOrders === 1 ? 'ordine' : 'ordini'} non completat{openOrders === 1 ? 'o' : 'i'} ({openOrdersTotal.toFixed(2)} €). Cosa ne facciamo?
            </p>
            <button onClick={() => setChoice('complete')} className={optionClass('complete')}>
              <span className="block font-black text-sm text-[var(--text-main)]">Completali</span>
              <span className="block text-xs text-[var(--text-muted)]">Entrano nel totale atteso e nelle statistiche.</span>
            </button>
            <button onClick={() => setChoice('leave')} className={optionClass('leave')}>
              <span className="block font-black text-sm text-[var(--text-main)]">Lasciali fuori</span>
              <span className="block text-xs text-[var(--text-muted)]">Restano com'è, fuori da totale atteso e statistiche.</span>
            </button>
          </div>
        )}

        <div className="flex gap-4">
          <button onClick={onCancel}
            className="flex-1 py-3 border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-bold hover:bg-gray-500/10 transition-all">ANNULLA</button>
          <button onClick={() => onConfirm(needsChoice ? choice : undefined)} disabled={needsChoice && !choice}
            className="flex-1 py-3 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">CONFERMA</button>
        </div>
      </div>
    </div>
  );
};

export default EndSessionModal;
