import { createContext, useContext } from 'react';

// Contesto dei messaggi a comparsa: il valore (showToast) lo fornisce ToastProvider.
export const ToastContext = createContext(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast deve essere utilizzato all\'interno di un ToastProvider');
    }
    return context;
};
