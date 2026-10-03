import React, { useState, useCallback, useRef } from 'react';
import { ToastContext } from './useToast';
import Toast from '../components/shared/Toast';


export const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState(null);
    const timerRef = useRef(null);

    /**
     * showToast
     * @param {string} message - Il testo da mostrare
     * @param {string} type - 'success', 'error', 'info' (default: 'success')
     * @param {number} duration - Durata in ms (default: 2000)
     */
    const showToast = useCallback((message, type = 'success', duration = 2000) => {
        // 1. Puliamo eventuali timer o toast precedenti per evitare sovrapposizioni
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast(null);

        // 2. Usiamo un piccolo delay per forzare il re-mount del componente.
        // Questo serve a far ripartire l'animazione d'entrata (il "visible" nel tuo Toast)
        setTimeout(() => {
            setToast({
                id: Date.now(), // ID univoco per forzare il re-render
                message,
                type,
                duration
            });
        }, 10);
    }, []);

    const hideToast = useCallback(() => {
        setToast(null);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            {/* Usiamo la 'key' basata sull'ID per distruggere e ricreare il componente 
         ogni volta che invii un nuovo messaggio. In questo modo l'animazione 
         del tuo Toast funzionerà sempre perfettamente.
      */}
            {toast && (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    type={toast.type}
                    duration={toast.duration}
                    onClose={hideToast}
                />
            )}
        </ToastContext.Provider>
    );
};
