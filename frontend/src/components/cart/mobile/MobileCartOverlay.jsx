import Cart from '../Cart';

// Carrello su telefono: un pulsante fisso in basso a destra (con numero di pezzi e totale)
// che apre il carrello a tutto schermo. `cartProps` sono le stesse del carrello desktop.
const MobileCartOverlay = ({ isOpen, onOpen, onClose, onReverseClick, cartProps }) => {
  const { cart, total } = cartProps;

  return (
    <>
      {!isOpen && (
        <button
          onClick={onOpen}
          className="fixed bottom-6 right-5 z-[1400] flex items-center gap-3 px-5 py-4 bg-[var(--accent)] text-white rounded-2xl font-black shadow-xl shadow-[var(--accent-shadow)] active:scale-95 transition-all"
        >
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-white text-[var(--accent)] text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
          <span className="text-sm tracking-wide">
            {cart.length > 0 ? `CASSA · ${total.toFixed(2)}€` : 'APRI CASSA'}
          </span>
        </button>
      )}

      <div
        className={`fixed inset-0 z-[1700] flex flex-col bg-[var(--bg-main)] transition-transform duration-300 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Cart {...cartProps} onClose={onClose}>
          <button onClick={onReverseClick}
            className="py-3 bg-purple-600/10 text-purple-600 border border-purple-100 dark:border-purple-900/30 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all">
            Storno Ordini
          </button>
        </Cart>
      </div>
    </>
  );
};

export default MobileCartOverlay;
