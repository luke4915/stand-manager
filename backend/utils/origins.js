// Origin ammessi per le chiamate dal browser: usati sia dalla CORS sia
// dall'handshake WebSocket. Si confronta l'hostname esatto, non una
// sottostringa: "https://localhost.sito-esterno.com" non deve passare.
const LAN_IP = /^192\.168\.\d{1,3}\.\d{1,3}$/;

export function isAllowedOrigin(origin) {
  let hostname;
  try {
    ({ hostname } = new URL(origin));
  } catch {
    return false;
  }
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || LAN_IP.test(hostname)
    || hostname.endsWith('.standmanager.local');
}
