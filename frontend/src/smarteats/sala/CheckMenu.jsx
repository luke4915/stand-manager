import { useState, useEffect, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import { iconBtn } from './ui';

// Menu «⋯» del conto: raccoglie le azioni secondarie così il pannello ne mostra solo due (Aggiungi, Incassa).
// `items`: [{ label, icon, onClick, danger?, disabled?, hint? }]; le voci false si saltano.
const CheckMenu = ({ items }) => {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const visible = items.filter(Boolean);
  if (!visible.length) return null;

  return (
    <div ref={box} className="relative">
      <button className={iconBtn} aria-label="Altre azioni" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><MoreVertical size={20} /></button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-30 w-60 p-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
          {visible.map(({ label, icon, onClick, danger, disabled, hint }) => {
            const Icon = icon;
            return (
              <button key={label} role="menuitem" disabled={disabled} title={disabled ? hint : undefined} onClick={() => { setOpen(false); onClick(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${danger ? 'text-red-500 hover:bg-red-500/10' : 'text-[var(--text-main)] hover:bg-[var(--bg-card-2)]'}`}>
                <Icon size={16} className="shrink-0" />{label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CheckMenu;
