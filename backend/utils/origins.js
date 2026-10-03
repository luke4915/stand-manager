// Origin ammessi per le chiamate dal browser: usati sia dalla CORS sia
// dall'handshake WebSocket. Si confronta l'hostname esatto, non una
// sottostringa: "https://localhost.sito-esterno.com" non deve passare.
//
// APP_DOMAIN è il dominio dell'app (ogni tenant è un suo sottodominio):
// standmanager.local in sviluppo, il dominio reale in produzione.
// Host locali e IP della rete LAN sono ammessi solo fuori dalla produzione.
const LAN_IP = /^192\.168\.\d{1,3}\.\d{1,3}$/;

const appDomain = () => process.env.APP_DOMAIN || 'standmanager.local';

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || LAN_IP.test(hostname);
}

export function isAllowedOrigin(origin) {
  let hostname;
  try {
    ({ hostname } = new URL(origin));
  } catch {
    return false;
  }
  const domain = appDomain();
  if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
  return process.env.NODE_ENV !== 'production' && isLocalHost(hostname);
}
