import React, { useState } from "react";
import { LogOut, Settings, Menu, CloudOff, RefreshCw, AlertTriangle, Printer } from "lucide-react";
import { useOfflineSync } from "../../offline/useOfflineSync";
import { usePrintQueue } from "../../print/usePrintQueue";
import FailedOrdersModal from "../shared/FailedOrdersModal";

const Header = ({ toggleSidebar, currentUser, onLogoutClick, onProfileClick, sessionName, wsConnected }) => {
  const { online, pending, failed, syncNow, refreshCounts } = useOfflineSync();
  const [showFailed, setShowFailed] = useState(false);
  const { pending: printPending, retryNow: retryPrint } = usePrintQueue();

  return (
    <header className="flex items-center justify-between px-4 mb-1 mt-3 bg-transparent shrink-0 select-none">

      {/* Sinistra: hamburger + breadcrumb */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="md:hidden h-10 w-10 flex items-center justify-center border border-[var(--border)] text-[var(--text-main)] rounded-lg cursor-pointer hover:enabled:bg-[var(--bg-card-2)] enabled:active:scale-95 transition"
          aria-label="Menu"
        >
          <Menu size={20} className="pointer-events-none" />
        </button>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="hidden sm:inline">{"Stand Manager"}</span>
            <span className="hidden sm:inline">/</span>
            <span className="font-medium text-[var(--text-main)] truncate max-w-[140px] sm:max-w-none">
              {sessionName || "Dashboard"}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--text-main)] leading-tight">
            {currentUser?.tenantName || "Stand Manager"}
          </h1>
        </div>
      </div>

      {/* Destra: profilo compatto */}
      {currentUser && (
        <div className="flex items-center gap-1.5">
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
              {pending > 0 && <span className="text-xs font-semibold">{pending}</span>}
            </button>
          )}
          {printPending > 0 && (
            <button
              onClick={retryPrint}
              title={`${printPending} stampe in attesa: controlla la stampante. Tocca per riprovare`}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-full cursor-pointer hover:bg-amber-500/20 active:scale-95 transition-all"
            >
              <Printer size={13} />
              <span className="text-xs font-semibold">{printPending}</span>
            </button>
          )}
          {failed > 0 && (
            <button
              onClick={() => setShowFailed(true)}
              title={`${failed} ordini offline rifiutati dal server: tocca per vederli`}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full cursor-pointer hover:bg-red-500/20 active:scale-95 transition-all"
            >
              <AlertTriangle size={13} />
              <span className="text-xs font-semibold">{failed}</span>
            </button>
          )}
          <div className="flex items-center gap-2 h-9 px-2 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs text-white font-semibold shrink-0">
              {currentUser.username[0].toUpperCase()}
            </div>
            <span className="hidden sm:block text-sm font-medium text-[var(--text-main)]">
              {currentUser.username}
            </span>
            <span
              title={wsConnected ? 'Connesso' : 'Non raggiungibile'}
              className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
          </div>
          <button
            onClick={onProfileClick}
            className="p-2 hover:bg-[var(--bg-card-2)] rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)] min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer enabled:active:scale-95"
          >
            <Settings size={18} className="pointer-events-none" />
          </button>
          <button
            onClick={onLogoutClick}
            className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer enabled:active:scale-95"
          >
            <LogOut size={18} className="pointer-events-none" />
          </button>
        </div>
      )}
      {showFailed && <FailedOrdersModal onClose={() => setShowFailed(false)} onChanged={() => { refreshCounts(); syncNow(); }} />}
    </header>
  );
};

export default Header;