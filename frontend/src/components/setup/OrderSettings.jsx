import React from "react";
import { HelpCircle } from "lucide-react";

const OrderSettings = ({ orderMode, setOrderMode }) => {
  const toggleMode = () =>
    setOrderMode(orderMode === "simple" ? "advanced" : "simple");

  return (
    <div className="bg-[var(--bg-card)] p-5 rounded-xl border border-[var(--border)] flex items-center justify-between mt-4">

      <h2 className="text-sm font-semibold text-[var(--text-main)]">
        Modalità Ordini
      </h2>

      <div className="flex items-center gap-3">

        {/* --- Etichetta Semplice --- */}
        <div className="flex items-center gap-1">
          <span
            className={`text-sm ${orderMode === "simple"
              ? "text-[var(--accent)] dark:text-[var(--accent)] font-semibold"
              : "text-gray-700 dark:text-gray-300"
              }`}
          >
            Semplice
          </span>

          {/* Tooltip */}
          <div className="relative group">
            <HelpCircle
              size={16}
              className="text-[var(--text-muted)] cursor-pointer"
            />
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-44
                            opacity-0 group-hover:opacity-100
                            bg-black text-white text-xs p-2 rounded-md shadow pointer-events-none
                            transition-opacity duration-300 whitespace-normal z-20">
              L’ordine viene completato immediatamente.
            </div>
          </div>
        </div>

        {/* --- Toggle identico a AppearanceSettings --- */}
        <button
          onClick={toggleMode}
          className={`relative w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-500
            ${orderMode === "advanced" ? "bg-[var(--accent)]" : "bg-[var(--bg-card-2)] border border-[var(--border)]"}`}
        >
          <div style={{ transform: orderMode === 'advanced' ? 'translateX(1.5rem)' : 'translateX(0)' }} className="absolute w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-500 ease-in-out"></div>
        </button>

        {/* --- Etichetta Avanzata --- */}
        <div className="flex items-center gap-1">
          <span
            className={`text-sm ${orderMode === "advanced"
              ? "text-[var(--accent)] dark:text-[var(--accent)] font-semibold"
              : "text-gray-700 dark:text-gray-300"
              }`}
          >
            Avanzata
          </span>

          {/* Tooltip */}
          <div className="relative group">
            <HelpCircle
              size={16}
              className="text-[var(--text-muted)] cursor-pointer"
            />
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-52
                            opacity-0 group-hover:opacity-100
                            bg-black text-white text-xs p-2 rounded-md shadow pointer-events-none
                            transition-opacity duration-300 whitespace-normal z-20">
              L’ordine viene inviato come “pending” e va completato manualmente.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OrderSettings;
