import React from "react";
import { LogOut, Settings, Menu, CloudOff, RefreshCw } from "lucide-react";
import { useOfflineSync } from "../../offline/useOfflineSync";

const Header = ({ toggleSidebar, currentUser, onLogoutClick, onProfileClick, sessionName, wsConnected }) => {
  const { online, pending, syncNow } = useOfflineSync();

  return (
    <header className="flex items-center justify-between px-4 mb-1 mt-3 bg-transparent shrink-0 select-none">

      {/* Sinistra: hamburger + breadcrumb */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="xl:hidden p-2.5 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] rounded-2xl cursor-pointer hover:enabled:bg-[var(--bg-card-2)] enabled:active:scale-95 transition-all"
          aria-label="Menu"
        >
          <Menu size={20} className="pointer-events-none" />
        </button>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="hidden sm:inline">{"Stand Manager"}</span>
            <span className="hidden sm:inline">/</span>
            <span className="font-medium text-[var(--text-main)] truncate max-w-[140px] sm:max-w-none">
              {sessionName || "Dashboard"}
            </span>
          </div>
          <h1 className="text-lg sm:text-2xl font-black tracking-tight text-[var(--text-main)] leading-tight">
            {currentUser?.tenantName || "Stand Manager"}
          </h1>
        </div>
      </div>

      {/* Destra: profilo compatto */}
      {currentUser && (
        <div className="flex items-center gap-1.5 bg-[var(--bg-card)] px-2 py-1.5 rounded-2xl border border-[var(--border)] shadow-sm">
          {(!online || pending > 0) && (
            <button
              onClick={syncNow}
              title={!online ? 'Sei offline (ordini salvati in locale)' : `${pending} ordini in attesa di sync`}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-full cursor-pointer hover:bg-amber-500/20 active:scale-95 transition-all"
            >
              {online ? (
                <RefreshCw size={13} className={pending > 0 ? "animate-spin" : ""} />
              ) : (
                <CloudOff size={13} />
              )}
              {pending > 0 && <span className="text-[10px] font-black">{pending}</span>}
            </button>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-card-2)] rounded-full">
            <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] text-white font-bold shrink-0">
              {currentUser.username[0].toUpperCase()}
            </div>
            <span className="hidden sm:block text-sm font-semibold text-[var(--text-main)]">
              {currentUser.username}
            </span>
            <span
              title={wsConnected ? 'Connesso' : 'Non raggiungibile'}
              className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
          </div>
          <button
            onClick={onProfileClick}
            className="p-2 hover:bg-[var(--bg-card-2)] rounded-full transition-all text-[var(--text-muted)] hover:text-[var(--text-main)] min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer enabled:active:scale-95"
          >
            <Settings size={18} className="pointer-events-none" />
          </button>
          <button
            onClick={onLogoutClick}
            className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-all min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer enabled:active:scale-95"
          >
            <LogOut size={18} className="pointer-events-none" />
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;