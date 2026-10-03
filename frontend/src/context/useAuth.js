import { createContext, useContext } from 'react';

// Contesto di autenticazione: il valore (utente, login, logout, refresh) lo fornisce AuthProvider.
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);
