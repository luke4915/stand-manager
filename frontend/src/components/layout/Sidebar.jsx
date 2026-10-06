import React from 'react';
import { canView } from './viewRoles';
import { LayoutDashboard, UtensilsCrossed, BarChart3, Settings, Database, ChevronLeft, ChevronRight, Power } from 'lucide-react';

const menuItems = [
  { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Cassa' },
  { id: 'kitchen', icon: <UtensilsCrossed size={20} />, label: 'Cucina' },
  { id: 'statistics', icon: <BarChart3 size={20} />, label: 'Statistiche' },
  { id: 'config', icon: <Database size={20} />, label: 'Menu' },
  { id: 'setup', icon: <Settings size={20} />, label: 'Sistema' },
];

const Sidebar = ({ view, setView, isOpen, toggleSidebar, currentUser, sessionActive, setSessionActive }) => (
  <aside className={`
    h-full bg-[var(--bg-card)] border-r border-[var(--border)]
    transition-[width,background-color,border-color] duration-300 ease-in-out
    flex flex-col items-center py-5
    ${isOpen ? 'w-64' : 'w-20'}
  `}>

    {/* Logo */}
    <div className="w-9 h-9 bg-[var(--accent)] rounded-lg flex items-center justify-center text-white font-semibold text-lg mb-8 shrink-0 select-none">
      S
    </div>

    {/* Nav */}
    <nav className="flex-1 w-full px-3 space-y-1 overflow-y-auto no-scrollbar">
      {menuItems
        .filter(item => canView(currentUser?.role, item.id, currentUser?.modules))
        .map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`
              w-full flex items-center px-3 py-2.5 rounded-lg transition-colors cursor-pointer
              ${!isOpen ? 'justify-center' : ''}
              ${view === item.id
                ? 'bg-[var(--bg-card-2)] text-[var(--text-main)] [&_svg]:text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-2)] hover:text-[var(--text-main)]'}
            `}
          >
            <div className="shrink-0 pointer-events-none">{item.icon}</div>
            {isOpen && (
              <span className="ml-3 text-sm font-medium whitespace-nowrap pointer-events-none">
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
            w-full flex items-center px-3 py-2.5 rounded-lg border transition-colors cursor-pointer
            ${!isOpen ? 'justify-center' : ''}
            ${sessionActive
              ? 'bg-green-500/10 border-green-500/30 text-green-500 enabled:hover:bg-green-500/20'
              : 'bg-red-500/10 border-red-500/30 text-red-500 enabled:hover:bg-red-500/20'}
          `}
        >
          <div className="shrink-0 pointer-events-none"><Power size={20} /></div>
          {isOpen && (
            <span className="ml-3 text-sm font-medium whitespace-nowrap pointer-events-none">
              {sessionActive ? 'Chiudi sessione' : 'Apri sessione'}
            </span>
          )}
        </button>
      </div>
    )}

    {/* Toggle — solo desktop */}
    <button
      onClick={toggleSidebar}
      className="md:flex hidden mt-2 p-3 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors shrink-0 cursor-pointer"
    >
      <div className="pointer-events-none">
        {isOpen ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
      </div>
    </button>

  </aside>
);

export default Sidebar;