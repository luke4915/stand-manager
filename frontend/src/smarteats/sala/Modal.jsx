import { useEffect } from 'react';
import { X } from 'lucide-react';

const SIZES = { md: 'sm:max-w-lg', lg: 'sm:max-w-3xl', xl: 'sm:max-w-6xl' };

// Finestra della Sala: a tutto schermo sul telefono, centrata e di larghezza scelta sul resto. Si chiude con Esc.
const Modal = ({ title, subtitle, onClose, size = 'md', closeOnOverlay = true, children }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1800] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onMouseDown={e => closeOnOverlay && e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`flex flex-col w-full ${SIZES[size]} max-h-[100dvh] sm:max-h-[92dvh] bg-[var(--bg-main)] sm:rounded-3xl sm:border border-[var(--border)] shadow-2xl overflow-hidden`}>
        <header className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text-main)] truncate">{title}</h2>
            {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 rounded-xl hover:bg-[var(--bg-card-2)] text-[var(--text-muted)] shrink-0"><X size={18} /></button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
