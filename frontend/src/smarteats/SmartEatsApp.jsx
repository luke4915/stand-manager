import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, UtensilsCrossed, BookOpen, BarChart3, Settings, LogOut, Moon, Sun, UserRound } from 'lucide-react';

import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { fetchWithAuth } from '../utils/apiClient';
import { visibleViews, canViewSmartEats, smartEatsHome } from './views';
import { useRealtime } from './useRealtime';
import { useService } from './useService';
import ServiceControl from './ServiceControl';
import SalaPage from './SalaPage';
import NoViewAvailable from '../components/layout/NoViewAvailable';
import UserProfile from '../components/shared/UserProfile';
import ProductConfig from '../components/products/ProductConfig';
import RoomsSettings from '../components/setup/RoomsSettings';
import UsersSettings from '../components/setup/UsersSettings';
import CoverSettings from './CoverSettings';
import CourseSettings from './CourseSettings';
import ModifierSettings from './ModifierSettings';
import { useModifiers } from './sala/useModifiers';

const CucinaPage = lazy(() => import('./cucina/CucinaPage'));
const StatistichePage = lazy(() => import('./statistiche/StatistichePage'));

const ICONS = { sala: LayoutGrid, cucina: UtensilsCrossed, carta: BookOpen, statistiche: BarChart3, impostazioni: Settings };
const NAV_CLASS = ({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium
  ${isActive ? 'bg-[var(--bg-card-2)] text-[var(--text-main)] [&>svg]:text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-2)] hover:text-[var(--text-main)]'}`;

const NavItem = ({ view, compact }) => {
  const Icon = ICONS[view.id];
  return (
    <NavLink to={`/${view.id}`} className={NAV_CLASS} title={view.label}>
      <Icon size={20} className="shrink-0" />
      <span className={compact ? 'sr-only' : 'hidden xl:inline'}>{view.label}</span>
    </NavLink>
  );
};

// Pagina a tutta larghezza (la Sala invece gestisce da sé le sue due colonne)
const Page = ({ children }) => (
  <div className="flex-1 overflow-y-auto no-scrollbar bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 sm:p-6 min-w-0">{children}</div>
);

// Carta (prodotti): per ora lo stesso editor della cassa; la carta di un ristorante avrà portate e categorie sue.
const CartaPage = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState(null);
  const [courses, setCourses] = useState(null);
  const modifiers = useModifiers();
  useEffect(() => {
    Promise.all([fetchWithAuth('/products'), fetchWithAuth('/courses')])
      .then(([list, courseList]) => { setProducts(list.map(p => ({ ...p, price: parseFloat(p.price) }))); setCourses(courseList.filter(c => c.active)); })
      .catch(err => showToast(err.message || 'Errore caricamento carta', 'error'));
  }, [showToast]);
  if (!products || !courses) return <p className="text-[var(--text-muted)]">Caricamento carta…</p>;
  return (
    <div className="space-y-6">
      <ModifierSettings groups={modifiers.groups} onChanged={modifiers.reload} />
      <ProductConfig products={products} setProducts={setProducts} courses={courses} modifierGroups={modifiers.groups} onModifiersSaved={modifiers.reload} />
    </div>
  );
};

const SettingsPage = ({ user }) => (
  <div className="space-y-6">
    <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Impostazioni</h2>
    {user.modules?.includes('tables') && <><CoverSettings /><CourseSettings /><RoomsSettings /></>}
    <UsersSettings />
  </div>
);

// App dei ristoranti e delle pizzerie (SmartEats): una shell e una dashboard proprie, separate da quelle della cassa
// delle sagre. Condivide col resto solo backend, login, utenti e componenti generici.
const SmartEatsApp = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { service, start, closingInfo, end, onEvent } = useService();
  const [event, setEvent] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);

  const handleMessage = useCallback((msg) => { onEvent(msg); setEvent(msg); }, [onEvent]);
  useRealtime(handleMessage);

  const views = visibleViews(user.role, user.modules);
  const home = smartEatsHome(user.role, user.modules);
  if (!home) return <NoViewAvailable onLogout={logout} />;

  const guard = (id, element) => (canViewSmartEats(user.role, id, user.modules) ? element : <Navigate to={`/${home}`} replace />);
  const doLogout = async () => { try { await logout(); showToast('Sessione chiusa', 'info'); navigate('/login'); } catch (err) { console.error(err); } };
  const canManageService = ['admin', 'responsabile', 'cassa'].includes(user.role);

  return (
    <div className="se-app flex h-[100dvh] w-full overflow-hidden bg-[var(--bg-main)]">
      {/* Menu laterale (desktop) */}
      <aside className={`${views.length > 1 ? 'hidden md:flex' : 'hidden'} flex-col shrink-0 w-20 xl:w-60 bg-[var(--bg-card)] border-r border-[var(--border)] py-5 px-3 gap-6`}>
        <div className="flex items-center gap-3 px-1">
          <div className="w-9 h-9 shrink-0 bg-[var(--accent)] rounded-lg flex items-center justify-center text-white font-semibold text-lg select-none">S</div>
          <span className="hidden xl:inline font-semibold text-base tracking-tight text-[var(--text-main)]">SmartEats</span>
        </div>
        <nav className="flex-1 space-y-1">{views.map(v => <NavItem key={v.id} view={v} />)}</nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-4 mt-3 mb-1 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-muted)] truncate">SmartEats{service ? ` / ${service.name}` : ''}</p>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--text-main)] leading-tight truncate">{user.tenantName}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ServiceControl service={service} canManage={canManageService} start={start} closingInfo={closingInfo} end={end} />
            <div className="flex items-center gap-0.5">
              <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 h-9 px-2.5 rounded-lg hover:bg-[var(--bg-card-2)] text-[var(--text-main)] cursor-pointer">
                <UserRound size={16} /><span className="hidden sm:inline text-xs font-semibold">{user.username}</span>
              </button>
              <button onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} aria-label="Cambia tema" className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-card-2)] text-[var(--text-muted)] cursor-pointer">
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button onClick={doLogout} aria-label="Esci" className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-red-500 cursor-pointer"><LogOut size={16} /></button>
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex gap-4 p-3 sm:p-4">
          <Suspense fallback={<Page><p className="text-[var(--text-muted)]">Caricamento…</p></Page>}>
            <Routes>
              <Route path="/sala" element={guard('sala', <SalaPage user={user} service={service} event={event} />)} />
              <Route path="/cucina" element={guard('cucina', <Page><CucinaPage event={event} /></Page>)} />
              <Route path="/carta" element={guard('carta', <Page><CartaPage /></Page>)} />
              <Route path="/statistiche" element={guard('statistiche', <Page><StatistichePage /></Page>)} />
              <Route path="/impostazioni" element={guard('impostazioni', <Page><SettingsPage user={user} /></Page>)} />
              <Route path="*" element={<Navigate to={`/${home}`} replace />} />
            </Routes>
          </Suspense>
        </div>

        {/* Barra di navigazione (telefono e tablet piccoli) */}
        {views.length > 1 && <nav className="md:hidden flex justify-around gap-1 px-2 py-2 bg-[var(--bg-card)] border-t border-[var(--border)] shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          {views.map(v => <NavItem key={v.id} view={v} compact />)}
        </nav>}
      </main>

      {showProfile && <UserProfile onClose={() => setShowProfile(false)} />}
    </div>
  );
};

export default SmartEatsApp;
