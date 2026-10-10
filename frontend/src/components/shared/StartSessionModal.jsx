import { useState } from 'react';

// Apertura di una nuova sessione (serata): chiede solo il nome.
// `onStart(nome)` la apre sul server; se fallisce il modale resta aperto.
const StartSessionModal = ({ onStart, onCancel, showToast }) => {
  const [name, setName] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return showToast('Inserisci un nome valido!', 'warning');
    await onStart(name.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-[2000] px-4 pb-4 sm:pb-0">
      <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md border border-[var(--border)] space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-black text-[var(--text-main)]">Apri una nuova sessione</h2>
          <p className="text-sm text-gray-400 mt-1">Assegna un nome al turno attuale</p>
        </div>
        <input type="text" autoFocus placeholder="Es. Sabato sera"
          value={name} onChange={e => setName(e.target.value)}
          className="w-full px-4 h-12 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] placeholder-gray-500 font-medium focus:outline-none focus:border-emerald-500 transition-all" />
        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 h-11 border border-[var(--border)] text-[var(--text-main)] rounded-lg font-medium hover:bg-gray-500/10 transition-colors">Annulla</button>
          <button type="submit"
            className="flex-1 h-11 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">Avvia</button>
        </div>
      </form>
    </div>
  );
};

export default StartSessionModal;
