import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from './context/useAuth';
import { useToast } from './context/useToast';
import { useIsMobile } from './hooks/useBreakpoint';

import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Cart from './components/cart/Cart';
import ProductList from './components/products/ProductList';
import ProductConfig from './components/products/ProductConfig';
import AppearanceSettings from './components/setup/AppearanceSettings';
import OrderSettings from './components/setup/OrderSettings';
import PrintProfiles from './components/setup/PrintProfiles';
import MenuSettings from './components/setup/MenuSettings';
import ReverseOrder from './components/shared/ReverseOrder';
import ChangePassword from './components/shared/ChangePassword';
import UserProfile from './components/shared/UserProfile';
import Login from './pages/LoginPage';
import { getDiscountedTotal } from './utils/pricing';
import CashCountModal from './components/shared/CashCountModal';
import { enqueueOrder } from './offline/syncQueue';
import { nextOrderNumber } from './offline/device';
import { useDevicePairing } from './offline/useDevicePairing';
import { printOrderTickets } from './print/printOrder';
import { saveProducts, loadCachedProducts } from './offline/productsCache';
import { remember, recall } from './offline/lastKnown';

import { WS_URL, WS_CLOSE_UNAUTHORIZED } from './config/api';
import { apiFetch, fetchWithAuth, NetworkError } from './utils/apiClient';
// Ruoli abilitati ad applicare sconti/omaggi (specchio di DISCOUNT_ROLES nel backend)
const DISCOUNT_ROLES = ['admin', 'responsabile'];

// Schermate pesanti o non usate alla cassa (grafici, PDF, lettore codici, pagine pubbliche):
// si caricano a richiesta, così il bundle della cassa resta leggero. Il service worker le
// mette comunque in cache, quindi funzionano anche offline.
const OrdersKitchen = lazy(() => import('./components/kitchen/OrdersKitchen'));
const Statistics = lazy(() => import('./components/shared/Statistics'));
const KDS = lazy(() => import('./pages/KDSPage'));
const MenuPage = lazy(() => import('./pages/MenuPage'));
const MasterPage = lazy(() => import('./pages/MasterPage'));

const PageLoading = () => (
  <div className="h-full min-h-[50vh] flex items-center justify-center text-[var(--text-main)]">Caricamento...</div>
);

const App = () => {
  const { user, loading, login, logout, refreshSession } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile(); // breakpoint 1280px

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('cart') || '[]'); }
    catch { return []; }
  });
  useEffect(() => { sessionStorage.setItem('cart', JSON.stringify(cart)); }, [cart]);
  const [total, setTotal] = useState(0);

  const [view, setView] = useState(user?.role === 'cucina' ? 'kitchen' : 'dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [showReversePopup, setShowReversePopup] = useState(false);
  const ws = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);

  const [theme, setTheme] = useState('dark');
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showProfilePopup, setShowProfilePopup] = useState(false);

  // Sessione (serata) aperta: { id, name } oppure null.
  const [activeSession, setActiveSession] = useState(null);
  const sessionActive = !!activeSession;
  useDevicePairing();
  const sessionName = activeSession?.name || '';
  // Stato della sessione arrivato dal server: si ricorda per i ricaricamenti senza rete.
  const applySession = useCallback((session) => {
    setActiveSession(session);
    remember('activeSession', session);
  }, []);
  const [showStartSessionModal, setShowStartSessionModal] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [showCashCountModal, setShowCashCountModal] = useState(false);
  const [inputSessionName, setInputSessionName] = useState('');
  const [orderMode, setOrderMode] = useState('simple');
  const [expectedCash, setExpectedCash] = useState(0);

  const audioCtxRef = useRef(null);
  const audioBuffers = useRef({});

  useEffect(() => {
    const path = window.location.pathname.replace('/', '') || 'dashboard';
    setView(path);
  }, []);

  useEffect(() => {
    if (user?.role === 'cucina') { setView('kitchen'); navigate('/kitchen'); }
  }, [user, navigate]);

  // Su mobile chiude sidebar dopo navigazione
  const handleSetView = (newView) => {
    setView(newView);
    navigate(`/${newView}`);
    if (isMobile) setIsSidebarOpen(false);
  };

  const getAudioContext = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const playSagraSound = async (soundName) => {
    if (!isSoundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!audioBuffers.current[soundName]) {
        const res = await apiFetch(`/assets/${soundName}.mp3`, { raw: true });
        const arrayBuffer = await res.arrayBuffer();
        audioBuffers.current[soundName] = await ctx.decodeAudioData(arrayBuffer);
      }
      const source = ctx.createBufferSource();
      source.buffer = audioBuffers.current[soundName];
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.15;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } catch (err) { console.warn('Audio error:', err); }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (loading || !user) return;
    fetchWithAuth('/sessions/latest')
      .then(data => applySession(data && !data.end_time ? { id: data.id, name: data.name } : null))
      .catch(err => {
        // Senza rete si riprende l'ultima sessione nota, per continuare a battere ordini in coda.
        if (err instanceof NetworkError) setActiveSession(recall('activeSession'));
      });
  }, [user, loading, applySession]);

  // Catalogo dal server; senza connessione si usa l'ultima copia salvata in locale.
  const loadProducts = useCallback(async () => {
    const normalize = (list) => list.map(p => ({ ...p, price: parseFloat(p.price) }));
    try {
      const data = await fetchWithAuth('/products');
      setProducts(normalize(data));
      saveProducts(data).catch(console.error);
    } catch (err) {
      if (err instanceof NetworkError) setProducts(normalize(await loadCachedProducts()));
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    loadProducts();
  }, [user, loading, loadProducts]);

  const wsReconnectTimer = useRef(null);
  const connectWS = useRef(null);
  connectWS.current = () => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    ws.current = new WebSocket(WS_URL);
    ws.current.onopen = () => setWsConnected(true);
    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'product_updated': setProducts(prev => prev.map(p => p.id === msg.product.id ? { ...msg.product, price: parseFloat(msg.product.price) } : p)); showToast(`"${msg.product.name}" aggiornato!`, 'success'); break;
          case 'product_created': setProducts(prev => [...prev, { ...msg.product, price: parseFloat(msg.product.price) }]); showToast('Nuovo prodotto aggiunto!', 'success'); break;
          case 'product_deleted': setProducts(prev => prev.filter(p => p.id !== msg.id)); showToast('Prodotto rimosso!', 'warning'); break;
          case 'product_stock_updated':
            setProducts(prev => prev.map(p =>
              p.id === msg.product.id
                ? { ...p, stock: msg.product.stock, visible: msg.product.visible }
                : p
            ));
            break;
          // L'apertura della sessione azzera lo stock lato server: ricarichiamo il catalogo.
          case 'session_started': applySession({ id: msg.session.id, name: msg.session.name }); loadProducts(); break;
          case 'session_ended': applySession(null); break;
          default: break;
        }
      } catch (err) { console.error('WS Parsing Error', err); }
    };
    ws.current.onclose = async (event) => {
      setWsConnected(false);
      // Token scaduto o non valido: rinnoviamo il cookie prima di riprovare.
      if (event.code === WS_CLOSE_UNAUTHORIZED && !(await refreshSession())) return;
      wsReconnectTimer.current = setTimeout(() => connectWS.current?.(), 3000);
    };
    ws.current.onerror = () => ws.current?.close();
  };

  useEffect(() => {
    if (loading || !user) return;
    connectWS.current();
    return () => {
      clearTimeout(wsReconnectTimer.current);
      if (ws.current) ws.current.onclose = null; // chiusura voluta: niente riconnessione
      ws.current?.close();
    };
  }, [user, loading]);

  // Il totale mostrato/usato per il resto è sempre quello REALE da incassare
  // (già al netto di eventuali sconti/omaggi per riga o sull'intero ordine).
  useEffect(() => setTotal(getDiscountedTotal(cart)), [cart]);

  const addToCart = (product, requestedQty = 1) => {
    // Calcoliamo la quantità GIÀ presente nel carrello per questo prodotto
    const currentCartQty = cart.filter(i => i.id === product.id).reduce((sum, i) => sum + i.quantity, 0);

    // Controllo dello stock disponibile
    if (product.stock_enabled && product.stock !== null) {
      if (currentCartQty + requestedQty > product.stock) {
        showToast(`Prodotto "${product.name}" esaurito o quantità massima raggiunta!`, 'warning');
        return false;
      }
    }

    playSagraSound('product_select_sound');

    setCart(prev => {
      const exists = prev.find(i => i.id === product.id && (i.note || '') === (product.note || ''));

      if (exists) {
        return prev.map(i => i.id === product.id && (i.note || '') === (product.note || '')
          ? { ...i, quantity: i.quantity + requestedQty }
          : i
        );
      }

      // Ogni nuovo prodotto entra come vendita piena, senza sconto/omaggio
      return [...prev, { ...product, quantity: requestedQty, type: 'sale', discountMode: null, discountValue: null }];
    });

    return true;
  };

  // Applica un adjustment (vendita normale / omaggio / sconto %-€) a UN singolo item del carrello.
  const updateItemType = (item, newType, discountMode = null, discountValue = null) => {
    setCart(prev => prev.map(i =>
      (i.id === item.id && (i.note || '') === (item.note || ''))
        ? {
          ...i,
          type: newType,
          discountMode: newType === 'discount' ? discountMode : null,
          discountValue: newType === 'discount' ? discountValue : null,
        }
        : i
    ));
  };

  // Applica in blocco una percentuale di sconto a TUTTO il carrello.
  // 0 -> tutti 'sale', 100 -> tutti 'gift' (omaggio), valori intermedi -> 'discount' percent.
  const applyOrderDiscount = (percent) => {
    const pct = Math.min(100, Math.max(0, Number(percent) || 0));
    setCart(prev => prev.map(i => {
      if (pct <= 0) return { ...i, type: 'sale', discountMode: null, discountValue: null };
      if (pct >= 100) return { ...i, type: 'gift', discountMode: null, discountValue: null };
      return { ...i, type: 'discount', discountMode: 'percent', discountValue: pct };
    }));
  };

  const clearCart = (isManual = false) => { if (isManual) playSagraSound('empty_cart_sound'); setCart([]); };
  const removeFromCart = (product) => setCart(prev => prev.filter(i => !(i.id === product.id && (i.note || '') === (product.note || ''))));
  const removeLastItem = (product) => setCart(prev => prev.map(i => i.id === product.id && (i.note || '') === (product.note || '') ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0));

  const sendOrder = async (isTakeaway = false) => {
    if (!sessionActive) return showToast('Nessuna sessione attiva!', 'error');
    if (cart.length === 0) return showToast('Carrello vuoto!', 'error');

    // Numero ordine dato dalla cassa (anche offline): resta lo stesso a ogni nuovo invio.
    const { displayCode, ...numbering } = await nextOrderNumber(activeSession.id);
    const payload = {
      items: cart.map(i => ({
        id: i.id, name: i.name, quantity: i.quantity, price: i.price, note: i.note || '',
        print_destination: i.print_destination || 'both',
        type: i.type || 'sale',
        discountMode: i.discountMode || null,
        discountValue: i.discountValue ?? null,
      })),
      status: orderMode === 'simple' ? 'completed' : 'pending',
      is_takeaway: isTakeaway,
      // Chiave di idempotenza: se la risposta si perde e l'ordine riparte dalla coda, non si duplica.
      client_order_id: crypto.randomUUID(),
      ...numbering,
    };

    const confirmOrder = (message, type) => {
      playSagraSound('order_confirm_sound');
      clearCart();
      showToast(message, type);
      if (isMobile) setIsMobileCartOpen(false);
    };
    // Le copie si stampano dalla cassa (anche offline): solo dopo che l'ordine è accettato
    // dal server, oppure quando va in coda perché il server non c'è.
    const printTickets = (code) => {
      if (!code) return showToast('Stampa non disponibile: dispositivo non ancora abbinato, serve una connessione.', 'warning');
      printOrderTickets({ cart, displayCode: code, clientOrderId: payload.client_order_id, sessionId: activeSession.id, isTakeaway })
        .catch(err => showToast(`Errore di stampa: ${err.message}`, 'error'));
    };
    const queueOffline = async () => {
      await enqueueOrder(payload, activeSession.id);
      printTickets(displayCode);
      confirmOrder('Sei offline: ordine salvato, verrà inviato al ritorno della connessione', 'warning');
    };

    if (!navigator.onLine) return queueOffline();
    try {
      const saved = await fetchWithAuth('/orders', { method: 'POST', body: payload });
      // Se il dispositivo non era abbinato il codice lo ha dato il server
      printTickets(saved.displayCode ?? displayCode);
      confirmOrder('Ordine inviato!', 'success');
    } catch (err) {
      // Rete caduta durante l'invio: l'ordine va in coda con la stessa chiave, quindi
      // se il server l'aveva già ricevuto non viene duplicato.
      if (err instanceof NetworkError) return queueOffline();
      showToast(`Errore: ${err.message}`, 'error');
    }
  };

  const handleSessionToggleClick = (targetState) => {
  const shouldActivate = typeof targetState === 'boolean' ? targetState : !sessionActive;
    if (shouldActivate) { setInputSessionName(''); setShowStartSessionModal(true); }
    else {
      fetchWithAuth('/sessions/expected-cash')
        .then(data => setExpectedCash(data.expected || 0))
        .catch(() => setExpectedCash(0));
      setShowEndSessionModal(true);
    }
  };

  const handleStartSessionSubmit = async (e) => {
    e.preventDefault();
    if (!inputSessionName.trim()) return showToast('Inserisci un nome valido!', 'warning');
    try {
      const data = await fetchWithAuth('/sessions/start', { method: 'POST', body: { name: inputSessionName.trim() } });
      applySession({ id: data.id, name: data.name }); setShowStartSessionModal(false);
      showToast(`Sessione "${data.name}" avviata!`, 'success');
    } catch (err) { showToast(err.message || 'Impossibile avviare la sessione', 'error'); }
  };

  const handleEndSessionConfirm = async (declaredCash) => {
    try {
      await fetchWithAuth('/sessions/end', { method: 'POST', body: { declaredCash } });
      applySession(null); setShowEndSessionModal(false);
      showToast('Sessione terminata.', 'info');
    } catch (err) { showToast(err.message || 'Impossibile chiudere la sessione', 'error'); }
  };

  const performLogout = async () => {
    try { await logout(); setShowLogoutConfirm(false); showToast('Sessione chiusa', 'info'); navigate('/login'); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[var(--bg-main)] text-[var(--text-main)]">Caricamento...</div>;

  if (window.location.pathname === '/kds') return <Suspense fallback={<PageLoading />}><KDS /></Suspense>;

  if (!user) return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login onLogin={login} />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/master" element={<MasterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );

  // Password temporanea: il server blocca tutto il resto finché non la si cambia
  if (user.needsPassword) return <ChangePassword onPasswordChanged={() => login({ ...user, needsPassword: false })} />;
  if (window.location.pathname === '/menu') return <MenuPage />;
  if (window.location.pathname === '/master') return <MasterPage />;

  const canDiscount = DISCOUNT_ROLES.includes(user?.role);

  const cartProps = {
    products, cart, setCart, total, addToCart, removeFromCart,
    removeLastItem, clearCart, sendOrder,
    sessionActive, setShowReversePopup, updateItemType, applyOrderDiscount, canDiscount
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[var(--bg-main)]">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      {/* Desktop: sempre presente nel flow */}
      <div className="hidden xl:block shrink-0 h-full">
        <Sidebar
          view={view} setView={handleSetView}
          isOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          currentUser={user}
          sessionActive={sessionActive} setSessionActive={handleSessionToggleClick}
          sessionName={sessionName}
        />
      </div>

      {/* Mobile: overlay fixed */}
      {isMobile && isSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1550]" onClick={() => setIsSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[1600] h-full">
            <Sidebar
              view={view} setView={handleSetView}
              isOpen={true} toggleSidebar={() => setIsSidebarOpen(false)}
              currentUser={user}
              sessionActive={sessionActive} setSessionActive={handleSessionToggleClick}
              sessionName={sessionName}
            />
          </div>
        </>
      )}

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          sessionName={sessionName}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
          currentUser={user}
          onLogoutClick={() => setShowLogoutConfirm(true)}
          onProfileClick={() => setShowProfilePopup(true)}
          wsConnected={wsConnected}
        />

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden p-3 sm:p-4 gap-4 min-h-0">

          {/* Pagine */}
          <div className="flex-1 overflow-y-auto no-scrollbar bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 sm:p-6 min-w-0">
            {user.role === 'cucina' ? (
              <OrdersKitchen />
            ) : (
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route path="/dashboard" element={<ProductList setProducts={setProducts} products={products} addToCart={addToCart} cart={cart} />} />
                  <Route path="/kitchen" element={<OrdersKitchen />} />
                  <Route path="/statistics" element={<Statistics />} />
                  <Route path="/config" element={<ProductConfig products={products} setProducts={setProducts} />} />
                  <Route path="/setup" element={
                    <div className="space-y-6">
                      <AppearanceSettings theme={theme} setTheme={setTheme} isSoundEnabled={isSoundEnabled} setIsSoundEnabled={setIsSoundEnabled} />
                      <MenuSettings />
                      <OrderSettings orderMode={orderMode} setOrderMode={setOrderMode} />
                      <PrintProfiles />
                    </div>
                  } />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            )}
          </div>

          {/* ── Carrello Desktop ──────────────────────────── */}
          {view === 'dashboard' && user.role !== 'cucina' && (
            <div className="w-[420px] hidden xl:flex flex-col shrink-0">
              <Cart {...cartProps} />
            </div>
          )}
        </div>
      </main>

      {/* ── Carrello Mobile overlay ──────────────────────────── */}
      {isMobile && view === 'dashboard' && user.role !== 'cucina' && (
        <>
          {/* FAB */}
          {!isMobileCartOpen && (
            <button
              onClick={() => setIsMobileCartOpen(true)}
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

          {/* Overlay fullscreen */}
          <div
            className={`fixed inset-0 z-[1700] flex flex-col bg-[var(--bg-main)] transition-transform duration-300 ease-out ${isMobileCartOpen ? 'translate-y-0' : 'translate-y-full'}`}
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <Cart {...cartProps} onClose={() => setIsMobileCartOpen(false)}>
              <button onClick={() => { setShowReversePopup(true); setIsMobileCartOpen(false); }}
                className="py-3 bg-purple-600/10 text-purple-600 border border-purple-100 dark:border-purple-900/30 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all">
                Storno Ordini
              </button>
            </Cart>
          </div>
        </>
      )}

      {/* ── Modali globali ───────────────────────────────────── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[2000] px-4">
          <div className="bg-[var(--bg-card)] p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center border border-[var(--border)]">
            <h2 className="text-2xl font-black mb-6 text-[var(--text-main)]">Sei sicuro?</h2>
            <div className="flex gap-4">
              <button onClick={performLogout} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold">LOGOUT</button>
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-bold">ANNULLA</button>
            </div>
          </div>
        </div>
      )}

      {showStartSessionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-[2000] px-4 pb-4 sm:pb-0">
          <form onSubmit={handleStartSessionSubmit} className="bg-[var(--bg-card)] p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md border border-[var(--border)] space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-black text-[var(--text-main)]">Apri Nuova Sessione</h2>
              <p className="text-sm text-gray-400 mt-1">Assegna un nome al turno attuale</p>
            </div>
            <input type="text" autoFocus placeholder="Es. Turno Sera Sabato..."
              value={inputSessionName} onChange={e => setInputSessionName(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] placeholder-gray-500 font-medium focus:outline-none focus:border-emerald-500 transition-all" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowStartSessionModal(false)}
                className="flex-1 py-3 border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-bold hover:bg-gray-500/10 transition-all">ANNULLA</button>
              <button type="submit"
                className="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all">AVVIA</button>
            </div>
          </form>
        </div>
      )}

      {showEndSessionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-[2000] px-4 pb-4 sm:pb-0">
          <div className="bg-[var(--bg-card)] p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md text-center border border-[var(--border)] space-y-5">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-black text-[var(--text-main)]">Terminare Sessione?</h2>
              <p className="text-sm text-gray-400 mt-2">
                Stai per chiudere <span className="font-bold text-[var(--text-main)]">"{sessionName}"</span>.
              </p>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowEndSessionModal(false)}
                className="flex-1 py-3 border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-bold hover:bg-gray-500/10 transition-all">ANNULLA</button>
              <button onClick={() => { setShowEndSessionModal(false); setShowCashCountModal(true); }}
                className="flex-1 py-3 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all">CONFERMA</button>
            </div>
          </div>
        </div>
      )}

      {showCashCountModal && (
        <CashCountModal
          expectedCash={expectedCash}
          onClose={() => setShowCashCountModal(false)}
          onConfirm={(declaredCash) => { setShowCashCountModal(false); handleEndSessionConfirm(declaredCash); }}
        />
      )}

      {showProfilePopup && <UserProfile user={user} onClose={() => setShowProfilePopup(false)} />}
      {showReversePopup && <ReverseOrder onClose={() => setShowReversePopup(false)} />}
    </div>
  );
};

export default App;