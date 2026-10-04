import React from 'react';
import { VIEW_ROLES } from './viewRoles';
import { LayoutDashboard, UtensilsCrossed, BarChart3, Settings, Database, ChevronLeft, ChevronRight, Power } from 'lucide-react';

const menuItems = [
  { id: 'dashboard', icon: <LayoutDashboard size={22} />, label: 'Cassa', roles: VIEW_ROLES.dashboard },
  { id: 'kitchen', icon: <UtensilsCrossed size={22} />, label: 'Cucina', roles: VIEW_ROLES.kitchen },
  { id: 'statistics', icon: <BarChart3 size={22} />, label: 'Stats', roles: VIEW_ROLES.statistics },
  { id: 'config', icon: <Database size={22} />, label: 'Menu', roles: VIEW_ROLES.config },
  { id: 'setup', icon: <Settings size={22} />, label: 'Sistema', roles: VIEW_ROLES.setup },
];

const Sidebar = ({ view, setView, isOpen, toggleSidebar, currentUser, sessionActive, setSessionActive }) => (
  <aside className={`
    h-full bg-[var(--bg-card)] border-r border-[var(--border)]
    transition-[width,background-color,border-color] duration-300 ease-in-out
    flex flex-col items-center py-6
    ${isOpen ? 'w-64' : 'w-20'}
  `}>

    {/* Logo */}
    <div className="w-11 h-11 bg-[var(--accent)] rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-[var(--accent-shadow)] mb-8 shrink-0 select-none">
      S
    </div>

    {/* Nav */}
    <nav className="flex-1 w-full px-3 space-y-2 overflow-y-auto no-scrollbar">
      {menuItems
        .filter(item => item.roles.includes(currentUser?.role))
        .map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`
              w-full flex items-center p-3.5 rounded-2xl transition-all duration-200 cursor-pointer
              ${!isOpen ? 'justify-center' : ''}
              ${view === item.id
                ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent-shadow)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-2)] hover:text-[var(--text-main)] active:scale-95'}
            `}
          >
            <div className="shrink-0 pointer-events-none">{item.icon}</div>
            {isOpen && (
              <span className="ml-3 font-black uppercase text-xs tracking-widest whitespace-nowrap pointer-events-none">
                {item.label}
              </span>
            )}
          </button>
        ))}
    </nav>

    {/* Sessione */}
    {currentUser?.role !== 'cucina' && (
      <div className="w-full px-3 mb-2 shrink-0">
        <button
          onClick={() => setSessionActive(!sessionActive)}
          className={`
            w-full flex items-center p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer
            ${!isOpen ? 'justify-center' : ''}
            ${sessionActive
              ? 'bg-green-500/10 border-green-500/30 text-green-500 enabled:hover:bg-green-500/20'
              : 'bg-red-500/10 border-red-500/30 text-red-500 enabled:hover:bg-red-500/20'}
          `}
        >
          <div className="shrink-0 pointer-events-none"><Power size={20} /></div>
          {isOpen && (
            <span className="ml-3 font-black uppercase text-xs tracking-widest whitespace-nowrap pointer-events-none">
              {sessionActive ? 'Chiudi Sessione' : 'Apri Sessione'}
            </span>
          )}
        </button>
      </div>
    )}

    {/* Toggle — solo desktop */}
    <button
      onClick={toggleSidebar}
      className="xl:flex hidden mt-2 p-3 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors shrink-0 cursor-pointer"
    >
      <div className="pointer-events-none">
        {isOpen ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
      </div>
    </button>

  </aside>
);

export default Sidebar;