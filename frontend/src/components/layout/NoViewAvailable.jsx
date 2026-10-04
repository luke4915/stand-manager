import { LogOut, PackageX } from 'lucide-react';

// Mostrata quando il ruolo dell'utente non ha nessuna pagina attiva nel suo locale
// (per esempio un utente cucina quando il modulo KDS è spento).
const NoViewAvailable = ({ onLogout }) => (
  <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 bg-[var(--bg-main)] text-center">
    <PackageX size={40} className="text-[var(--text-muted)]" />
    <div>
      <h1 className="text-xl font-black text-[var(--text-main)]">Nessuna funzione disponibile</h1>
      <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm">Il tuo ruolo non ha pagine attive in questo locale. Chiedi all'amministratore.</p>
    </div>
    <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-black text-xs uppercase tracking-widest hover:bg-[var(--bg-card-2)]">
      <LogOut size={14} /> Esci
    </button>
  </div>
);

export default NoViewAvailable;
