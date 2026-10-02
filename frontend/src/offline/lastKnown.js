// Ultimi valori noti su questo dispositivo (utente, sessione aperta), usati solo
// quando il server non è raggiungibile. localStorage è separato per origine,
// quindi per sottodominio: ogni tenant ha i suoi valori.
const PREFIX = 'standmanager:';

export function remember(key, value) {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* storage non disponibile: si lavora solo online */ }
}

export function recall(key) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key));
  } catch {
    return null;
  }
}
