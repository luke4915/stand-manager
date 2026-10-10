import { ShoppingCart } from 'lucide-react';
import Cart from '../Cart';

// Carrello su telefono: una barra fissa in basso (quanti articoli e il totale) che apre
// il carrello a tutto schermo. `cartProps` sono le stesse del carrello desktop.
const MobileCartOverlay = ({ isOpen, onOpen, onClose, onReverseClick, cartProps }) => {
  const { cart, total } = cartProps;
  const pieces = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      {!isOpen && (
        <button
          onClick={onOpen}
          className={`fixed inset-x-3 z-[1400] h-14 px-4 rounded-xl flex items-center justify-between font-medium active:scale-[0.98] transition ${cart.length > 0 ? 'bg-[var(--accent)] text-white shadow-lg' : 'bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border)]'}`}
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <span className="flex items-center gap-2.5 text-sm">
            <ShoppingCart size={20} />
            {cart.length > 0 ? `${pieces} ${pieces === 1 ? 'articolo' : 'articoli'}` : 'Apri la cassa'}
          </span>
          {cart.length > 0 && <span className="text-base font-semibold tabular-nums">{total.toFixed(2)} €</span>}
        </button>
      )}

      <div
        className={`fixed inset-0 z-[1700] flex flex-col bg-[var(--bg-main)] transition-transform duration-300 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Cart {...cartProps} onClose={onClose}>
          <button onClick={onReverseClick}
            className="text-purple-600 !border-purple-500/30 active:bg-purple-500/10 transition">
            Storno ordini
          </button>
        </Cart>
      </div>
    </>
  );
};

export default MobileCartOverlay;
