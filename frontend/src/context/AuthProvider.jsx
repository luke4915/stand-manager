import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthContext } from './useAuth';
import { apiFetch, fetchWithAuth, setAuthHandlers, NetworkError } from '../utils/apiClient';
import { remember, recall } from '../offline/lastKnown';

// Rinnovo silenzioso ogni ora: il token dura 8 ore, quindi c'è sempre margine.
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef(null);

  // Sessione chiusa (logout, rinnovo rifiutato, licenza scaduta): si torna al login.
  const clearSession = useCallback(() => {
    setUser(null);
    remember('user', null);
    clearInterval(refreshTimer.current);
  }, []);

  // Ritorna false solo se la sessione è persa (il server ha rifiutato il rinnovo).
  // Con la rete assente non si butta fuori l'operatore: si riproverà più tardi.
  const executeRefresh = useCallback(async () => {
    try {
      await apiFetch('/auth/refresh', { method: 'POST' });
      return true;
    } catch (err) {
      if (err instanceof NetworkError) {
        console.warn('Rinnovo sessione rimandato: server non raggiungibile', err);
        return true;
      }
      clearSession();
      return false;
    }
  }, [clearSession]);

  const startRefreshTimer = useCallback(() => {
    clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(executeRefresh, REFRESH_INTERVAL_MS);
  }, [executeRefresh]);

  // Il client API usa queste azioni per rinnovare la sessione e per uscire.
  useEffect(() => {
    setAuthHandlers({ refresh: executeRefresh, onAccessDenied: clearSession });
  }, [executeRefresh, clearSession]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // fetchWithAuth: con un token scaduto da poco (tablet rimasto in standby) la sessione
        // si rinnova invece di tornare al login. Le azioni di rinnovo sono già registrate
        // dall'effect precedente, che React esegue prima di questo.
        const userData = await fetchWithAuth('/auth/me');
        setUser(userData);
        remember('user', userData);
        // A ogni apertura o ricaricamento della pagina il token riparte da 8 ore piene.
        await executeRefresh();
        startRefreshTimer();
      } catch (err) {
        if (err instanceof NetworkError) {
          // Server non raggiungibile: si riprende l'ultimo utente di questo dispositivo,
          // così la cassa continua a lavorare e a mettere ordini in coda. Al ritorno
          // della rete, se il cookie non è più valido, il 401 riporta al login.
          console.warn('Server non raggiungibile, uso l\'ultimo utente noto', err);
          setUser(recall('user'));
        } else {
          clearSession();
        }
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
    return () => clearInterval(refreshTimer.current);
  }, [executeRefresh, startRefreshTimer, clearSession]);

  const login = (userData) => {
    setUser(userData);
    remember('user', userData);
    startRefreshTimer();
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout sul server non riuscito, pulizia dello stato locale', err);
    }
    clearSession();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshSession: executeRefresh }}>
      {children}
    </AuthContext.Provider>
  );
};
