import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from './context/useAuth';
import { useToast } from './context/useToast';
import { useIsMobile } from './hooks/useBreakpoint';
import { useSound } from './hooks/useSound';
import { useCart } from './hooks/useCart';
import { useProducts } from './hooks/useProducts';
import { useWorkSession } from './hooks/useWorkSession';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { useDevicePairing } from './offline/useDevicePairing';
import { sendOrder } from './utils/sendOrder';

import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import LogoutConfirmModal from './components/layout/LogoutConfirmModal';
import Cart from './components/cart/Cart';
import MobileCartOverlay from './components/cart/mobile/MobileCartOverlay';
import ProductList from './components/products/ProductList';
import ProductConfig from './components/products/ProductConfig';
import AppearanceSettings from './components/setup/AppearanceSettings';
import OrderSettings from './components/setup/OrderSettings';
import PrintProfiles from './components/setup/PrintProfiles';
import MenuSettings from './components/setup/MenuSettings';
import { canView, defaultView } from './components/layout/viewRoles';
import NoViewAvailable from './components/layout/NoViewAvailable';
import UsersSettings from './components/setup/UsersSettings';
import ReverseOrder from './components/shared/ReverseOrder';
import ChangePassword from './components/shared/ChangePassword';
import UserProfile from './components/shared/UserProfile';
import StartSessionModal from './components/shared/StartSessionModal';
import CloseSessionFlow from './components/shared/CloseSessionFlow';
import Login from './pages/LoginPage';

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

// Il guscio della cassa delle sagre dopo il login: menu laterale, testata, pagine, carrello e finestre comuni.
// La logica sta negli hook (cartella hooks/) e nei componenti: qui si collegano tra loro.
const App = () => {
  const { user, loading, login, logout, refreshSession } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile(); // telefono: sotto 768 px. Da 768 in su (tablet, PC) menu e carrello stanno in pagina
  const isLoggedIn = !loading && !!user;

  // ── Preferenze del dispositivo ────────────────────────────
  const [theme, setTheme] = useState('dark');
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [orderMode, setOrderMode] = useState('simple');
  const playSound = useSound(isSoundEnabled);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // ── Dati: catalogo, serata, carrello ──────────────────────
  useDevicePairing();
  const { products, setProducts, loadProducts } = useProducts(isLoggedIn);
  const { activeSession, applySession, startSession, endSession } = useWorkSession(isLoggedIn);
  const sessionActive = !!activeSession;
  const sessionName = activeSession?.name || '';
  const cartState = useCart({ showToast, playSound });
  const { cart, clearCart } = cartState;

  // ── Aggiornamenti in tempo reale dal server ───────────────
  const wsConnected = useLiveUpdates((msg) => {
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
  }, { enabled: isLoggedIn, onUnauthorized: refreshSession });

  // ── Navigazione e finestre aperte ─────────────────────────
  const [view, setView] = useState(user?.role === 'cucina' ? 'kitchen' : 'dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [showReversePopup, setShowReversePopup] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showStartSessionModal, setShowStartSessionModal] = useState(false);
  const [showCloseSession, setShowCloseSession] = useState(false);

  // Pagina iniziale dall'URL, ma solo se il ruolo la può vedere (es. un utente cassa che rientra su /statistics).
  // Una volta per ruolo: non deve rigirare a ogni navigazione.
  const checkedRole = useRef(null);
  useEffect(() => {
    if (!user?.role || checkedRole.current === user.role) return;
    checkedRole.current = user.role;
    const path = window.location.pathname.replace('/', '') || 'dashboard';
    if (canView(user.role, path, user.modules)) return setView(path);
    const home = defaultView(user.role, user.modules);
    if (!home) return;
    setView(home);
    navigate(`/${home}`, { replace: true });
  }, [user?.role, user?.modules, navigate]);

  useEffect(() => {
    if (user?.role === 'cucina') { setView('kitchen'); navigate('/kitchen'); }
  }, [user, navigate]);

  // Su mobile chiude sidebar dopo navigazione
  const handleSetView = (newView) => {
    setView(newView);
    navigate(`/${newView}`);
    if (isMobile) setIsSidebarOpen(false);
  };

  // ── Azioni ────────────────────────────────────────────────
  const handleSendOrder = (isTakeaway = false) => sendOrder({
    cart, isTakeaway, activeSession, orderMode, clearCart, playSound, showToast,
    onSent: () => { if (isMobile) setIsMobileCartOpen(false); },
  });

  // Dal menu laterale: apre la sessione se è chiusa, avvia la chiusura se è aperta.
  const handleSessionToggleClick = (targetState) => {
    const shouldActivate = typeof targetState === 'boolean' ? targetState : !sessionActive;
    if (shouldActivate) setShowStartSessionModal(true);
    else setShowCloseSession(true);
  };

  const handleStartSession = async (name) => {
    try {
      const data = await startSession(name);
      setShowStartSessionModal(false);
      showToast(`Sessione "${data.name}" avviata!`, 'success');
    } catch (err) { showToast(err.message || 'Impossibile avviare la sessione', 'error'); }
  };

  const handleEndSession = async (declaredCash, openOrders) => {
    setShowCloseSession(false);
    try {
      await endSession(declaredCash, openOrders);
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

  // Prima pagina disponibile; senza nessuna (es. ruolo cucina senza il modulo KDS) si avvisa invece di girare in tondo.
  const home = defaultView(user.role, user.modules);
  if (!home) return <NoViewAvailable onLogout={performLogout} />;

  const canDiscount = DISCOUNT_ROLES.includes(user?.role);

  const cartProps = {
    ...cartState, products, sendOrder: handleSendOrder,
    sessionActive, setShowReversePopup, canDiscount
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[var(--bg-main)]">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      {/* Desktop: sempre presente nel flow */}
      <div className="hidden md:block shrink-0 h-full">
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
                  <Route path="/dashboard" element={canView(user.role, 'dashboard', user.modules) ? <ProductList setProducts={setProducts} products={products} addToCart={cartState.addToCart} removeLastItem={cartState.removeLastItem} cart={cart} /> : <Navigate to={`/${home}`} replace />} />
                  <Route path="/kitchen" element={canView(user.role, 'kitchen', user.modules) ? <OrdersKitchen /> : <Navigate to={`/${home}`} replace />} />
                  <Route path="/statistics" element={canView(user.role, 'statistics', user.modules) ? <Statistics /> : <Navigate to={`/${home}`} replace />} />
                  <Route path="/config" element={canView(user.role, 'config', user.modules) ? <ProductConfig products={products} setProducts={setProducts} /> : <Navigate to={`/${home}`} replace />} />
                  <Route path="/setup" element={!canView(user.role, 'setup', user.modules) ? <Navigate to={`/${home}`} replace /> :
                    <div className="space-y-6">
                      <AppearanceSettings theme={theme} setTheme={setTheme} isSoundEnabled={isSoundEnabled} setIsSoundEnabled={setIsSoundEnabled} />
                      <MenuSettings />
                      <OrderSettings orderMode={orderMode} setOrderMode={setOrderMode} />
                      <PrintProfiles />
                      {user.role === 'admin' && <UsersSettings />}
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
            <div className="w-[340px] xl:w-[420px] hidden md:flex flex-col shrink-0">
              <Cart {...cartProps} />
            </div>
          )}
        </div>
      </main>

      {/* ── Carrello Mobile overlay ──────────────────────────── */}
      {isMobile && view === 'dashboard' && user.role !== 'cucina' && (
        <MobileCartOverlay
          isOpen={isMobileCartOpen}
          onOpen={() => setIsMobileCartOpen(true)}
          onClose={() => setIsMobileCartOpen(false)}
          onReverseClick={() => { setShowReversePopup(true); setIsMobileCartOpen(false); }}
          cartProps={cartProps}
        />
      )}

      {/* ── Finestre comuni ──────────────────────────────────── */}
      {showLogoutConfirm && <LogoutConfirmModal onConfirm={performLogout} onCancel={() => setShowLogoutConfirm(false)} />}
      {showStartSessionModal && (
        <StartSessionModal onStart={handleStartSession} onCancel={() => setShowStartSessionModal(false)} showToast={showToast} />
      )}
      {showCloseSession && (
        <CloseSessionFlow sessionName={sessionName} onCancel={() => setShowCloseSession(false)} onConfirm={handleEndSession} />
      )}
      {showProfilePopup && <UserProfile onClose={() => setShowProfilePopup(false)} />}
      {showReversePopup && <ReverseOrder onClose={() => setShowReversePopup(false)} />}
    </div>
  );
};

export default App;