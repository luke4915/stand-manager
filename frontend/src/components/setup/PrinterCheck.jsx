import React, { useState } from 'react';
import { ShieldCheck, Printer } from 'lucide-react';
import { printerPageUrl, testPrint } from '../../print/testPrint';

// Abbinamento della stampante a QUESTO dispositivo: il certificato va accettato una volta per
// dispositivo, poi la stampa di prova conferma che rete, certificato e stampante funzionano.
const PrinterCheck = ({ address }) => {
  const [state, setState] = useState(null); // null | 'testing' | { error }

  if (!address) return null;

  const runTest = async () => {
    setState('testing');
    setState({ error: await testPrint(address) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <a href={printerPageUrl(address)} target="_blank" rel="noreferrer"
        title="Apre la pagina della stampante: accetta il certificato di sicurezza, poi torna qui"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-main)] hover:border-[var(--accent)] transition-colors">
        <ShieldCheck size={14} /> 1. Autorizza
      </a>
      <button type="button" onClick={runTest} disabled={state === 'testing'}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--accent)] text-white disabled:opacity-50 transition-colors">
        <Printer size={14} /> {state === 'testing' ? 'Invio...' : '2. Stampa di prova'}
      </button>
      {state && state !== 'testing' && (
        <span className={`text-[11px] font-bold ${state.error ? 'text-red-500' : 'text-green-500'}`}>
          {state.error ?? 'Stampante pronta su questo dispositivo'}
        </span>
      )}
    </div>
  );
};

export default PrinterCheck;
