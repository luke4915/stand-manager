import { ChevronLeft } from 'lucide-react';

// Struttura comune a tutte le viste del pannello a destra (come il carrello della cassa): testata, corpo che scorre,
// piede con le azioni. Le viste cambiano dentro lo stesso pannello: niente finestre sopra le finestre.
const PanelFrame = ({ title, subtitle, subtitleClass = 'text-[var(--text-muted)]', onBack, actions, footer, children }) => (
  <div className="flex flex-col h-full bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
    <header className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border)] shrink-0">
      {onBack && <button onClick={onBack} aria-label="Indietro" className="p-1.5 -ml-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-2)]"><ChevronLeft size={22} /></button>}
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-black tracking-tighter uppercase text-[var(--text-main)] truncate">{title}</h2>
        {subtitle && <span className={`text-[11px] font-black uppercase tracking-widest ${subtitleClass}`}>{subtitle}</span>}
      </div>
      {actions}
    </header>
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 no-scrollbar">{children}</div>
    {footer && <footer className="border-t border-[var(--border)] p-4 space-y-3 shrink-0">{footer}</footer>}
  </div>
);

export default PanelFrame;
