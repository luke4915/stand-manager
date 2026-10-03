// Driver Epson ePOS-Print: POST dell'XML a https://<ip>:<porta>/cgi-bin/epos/service.cgi.
// Il browser non può ignorare il certificato autofirmato della stampante: va accettato
// una volta per dispositivo aprendo https://<ip> (lo guida la schermata delle impostazioni).
import { EposBuilder } from '../eposBuilder.js';

export const DEFAULT_PORT = 443;
const DEVICE_ID = 'local_printer';
const PRINTER_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 15000;

export const eposDriver = {
  id: 'epos',
  createBuilder: () => new EposBuilder(),

  // Invia un documento già costruito. Lancia PrintError se la stampante non risponde o rifiuta.
  async send(builder, { host, port = DEFAULT_PORT, devid = DEVICE_ID }) {
    const url = `https://${host}:${port}/cgi-bin/epos/service.cgi?devid=${devid}&timeout=${PRINTER_TIMEOUT_MS}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' },
        body: builder.buildXml(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new PrintError('Stampante non raggiungibile: controlla rete, indirizzo e certificato', { cause: err, retryable: true });
    }
    const body = await res.text();
    if (/success="true"/.test(body)) return;
    const code = body.match(/code="([^"]*)"/)?.[1] ?? 'sconosciuto';
    // Errori della stampante (carta finita, coperchio aperto): si può riprovare dopo averli risolti
    throw new PrintError(`La stampante ha rifiutato il lavoro (codice ${code})`, { retryable: true });
  },
};

export class PrintError extends Error {
  constructor(message, { cause, retryable = false } = {}) {
    super(message, { cause });
    this.name = 'PrintError';
    this.retryable = retryable;
  }
}
