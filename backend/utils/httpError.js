// Errore con status HTTP, per interrompere una transazione con una risposta precisa
// (es. 409 stock insufficiente). La route lo intercetta con sendHttpError.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Risponde se err è un HttpError e ritorna true; altrimenti ritorna false
// e lascia alla route la gestione dell'errore imprevisto.
export function sendHttpError(res, err) {
  if (!(err instanceof HttpError)) return false;
  res.status(err.status).json({ error: err.message, ...(err.code && { code: err.code }) });
  return true;
}
