import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

import { API_URL } from '../config/api';
import { remember, recall } from '../offline/lastKnown';
const AuthContext = createContext();

// Refresh silenzioso ogni 6h — il token dura 8h quindi c'è sempre margine
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef(null);

  // Ritorna false solo se la sessione è persa (il server ha rifiutato il refresh).
  // Stabile tra i render (useCallback): i componenti possono metterla nelle dipendenze degli effect.
  const executeRefresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        // Se il server risponde con un errore (es: token revocato o utente eliminato), logout forzato
        setUser(null);
        remember('user', null);
        if (refreshTimer.current) clearInterval(refreshTimer.current);
        return false;
      }
      return true;
    } catch (err) {
      // Se il server è temporaneamente offline o c'è un calo di Wi-Fi durante la sagra,
      // non buttiamo fuori l'utente! Generiamo solo un avviso in console.
      console.warn('Refresh token momentaneamente fallito (problema di rete o server occupato):', err);
      return true; // sessione non persa: chi chiama può riprovare più tardi
    }
  }, []);

  const startRefreshTimer = () => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(executeRefresh, REFRESH_INTERVAL_MS);
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          remember('user', userData);
          
          // 🚀 IL FIX STRATEGICO PER IL REFRESH PAGINA (F5):
          // Non appena l'operatore ricarica la pagina o apre una nuova tab, 
          // forziamo SUBITO un refresh preventivo del cookie.
          // In questo modo il token viene esteso a 8 ore piene a partire da QUESTO ESATTO MOMENTO.
          await executeRefresh();
          
          // Ora che il token è fresco al 100%, facciamo partire il timer orario di mantenimento
          startRefreshTimer();
        } else {
          setUser(null);
          remember('user', null);
        }
      } catch (err) {
        // Server non raggiungibile (rete assente): si riprende l'ultimo utente di questo
        // dispositivo, così la cassa continua a lavorare e a mettere ordini in coda.
        // Al ritorno della rete, se il cookie non è più valido, il 401 riporta al login.
        console.warn('Server non raggiungibile, uso l\'ultimo utente noto', err);
        setUser(recall('user'));
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, []);

  const login = (userData) => {
    setUser(userData);
    remember('user', userData);
    startRefreshTimer();
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      console.warn('Chiamata di logout al server fallita, pulizia stato locale in corso...', err);
    }
    // Pulizia immediata e aggressiva dello stato locale (UX istantanea per l'operatore)
    setUser(null);
    remember('user', null);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshSession: executeRefresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);