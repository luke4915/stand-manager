import { lazy, Suspense } from 'react';
import App from './App';
import { useAuth } from './context/useAuth';
import { usesSmartEats } from './smarteats/views';

const SmartEatsApp = lazy(() => import('./smarteats/SmartEatsApp'));

// Pagine pubbliche e master: valgono per tutti i locali e le gestisce App.
const SHARED_PATHS = ['/kds', '/menu', '/master'];

// Un locale è una sagra (o un paninaro) oppure un ristorante: sono due app distinte, mai mescolate.
// Chi è già autenticato in un locale di tipo ristorante entra in SmartEats; tutto il resto (login, cambio
// password temporanea, sagre, pagine pubbliche) resta ad App.
const AppRouter = () => {
  const { user, loading } = useAuth();
  const shared = SHARED_PATHS.includes(window.location.pathname);
  if (!loading && user && !user.needsPassword && usesSmartEats(user) && !shared) {
    return (
      <Suspense fallback={<div className="h-screen flex items-center justify-center bg-[var(--bg-main)] text-[var(--text-main)]">Caricamento...</div>}>
        <SmartEatsApp />
      </Suspense>
    );
  }
  return <App />;
};

export default AppRouter;
