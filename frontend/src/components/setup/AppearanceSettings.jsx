import React from 'react';
import { Moon, Sun, Volume2, VolumeX } from 'lucide-react';

// Il tema viene gestito in App.jsx — questo componente non duplica il useEffect
const AppearanceSettings = ({ theme, setTheme, isSoundEnabled, setIsSoundEnabled }) => (
  <div className="max-w-4xl mx-auto space-y-6">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Impostazioni</h2>
      <p className="text-xs font-semibold text-[var(--text-muted)] mt-1">Personalizza la tua esperienza</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Tema */}
      <div className="bg-[var(--bg-card)] p-6 rounded-xl border border-[var(--border)]">
        <div className="flex justify-between items-center mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-indigo-500 text-white' : 'bg-yellow-400 text-gray-900'}`}>
            {theme === 'dark' ? <Moon size={24} /> : <Sun size={24} />}
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${theme === 'dark' ? 'bg-[var(--accent)]' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${theme === 'dark' ? 'translate-x-8' : 'translate-x-1'}`} />
          </button>
        </div>
        <h3 className="font-semibold text-[var(--text-main)] tracking-tight">Modalità {theme === 'dark' ? 'Notte' : 'Giorno'}</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">Ottimizza la visibilità in base alle luci della sagra.</p>
      </div>

      {/* Audio */}
      <div className="bg-[var(--bg-card)] p-6 rounded-xl border border-[var(--border)]">
        <div className="flex justify-between items-center mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isSoundEnabled ? 'bg-green-500 text-white' : 'bg-[var(--bg-card-2)] text-[var(--text-muted)]'}`}>
            {isSoundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
          </div>
          <button
            onClick={() => setIsSoundEnabled(!isSoundEnabled)}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${isSoundEnabled ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${isSoundEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
          </button>
        </div>
        <h3 className="font-semibold text-[var(--text-main)] tracking-tight">Feedback Audio</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">Suono al tocco prodotti e all'invio ordine</p>
      </div>
    </div>
  </div>
);

export default AppearanceSettings;