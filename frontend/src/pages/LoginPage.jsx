import { useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useToast } from '../context/useToast'; // Hook globale

// Rimosso showToast dalle props, ora lo prendiamo dal Context
const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 🛡️ Inizializziamo il toast globale
  const { showToast } = useToast();

  const handleLogin = async () => {
    if (!username.trim()) {
      showToast("Inserisci l'username", "error");
      return;
    }

    setLoading(true);
    try {
      // apiFetch e non fetchWithAuth: qui un 401 significa credenziali errate, non sessione scaduta.
      const data = await apiFetch('/auth/login', { method: 'POST', body: { username, password } });

      // ✅ Login effettuato con successo
      showToast("Login effettuato!", "success");

      // Passiamo i dati al chiamante (App.jsx) che aggiornerà l'AuthContext
      // Tutto ciò che risponde il server (ruolo, tenant, tipo di attività, moduli…): niente elenco di campi da tenere allineato.
      onLogin(data);

    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Gestione invio con tasto Enter
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-main)]">

      {/* LOGO */}
      <img
        src="/logo_StandManager_ESC_POS.png"
        alt="Logo"
        className="w-40 mb-6 drop-shadow-md border-2 border-black bg-white p-2"
      />

      <h1 className="text-2xl font-black mb-6 text-[var(--text-main)]">
        Login Stand Manager
      </h1>

      <div className="flex flex-col gap-4 w-80">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <input
          type="password"
          placeholder="Password (vuota se non impostata)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          className={`w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-[var(--accent)]/30 transition-all ${loading ? "opacity-50 cursor-not-allowed" : ""
            }`}
        >
          {loading ? "Accesso in corso..." : "Login"}
        </button>
      </div>
    </div>
  );
};

export default Login;