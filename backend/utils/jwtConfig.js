// Impostazioni comuni dei token: algoritmo fissato (un token con "alg: none" o con un altro
// algoritmo non è mai valido) e controllo dei segreti all'avvio.
export const JWT_ALGORITHM = 'HS256';
export const VERIFY_OPTIONS = { algorithms: [JWT_ALGORITHM] };
export const SIGN_OPTIONS = { algorithm: JWT_ALGORITHM };

const MIN_SECRET_LENGTH = 32;

// `missing`: segreti assenti (l'app non può partire). `weak`: presenti ma deboli o uguali tra loro
// (in produzione l'app non parte, in sviluppo si avvisa soltanto).
export function checkSecrets(env = process.env) {
  const missing = [];
  const weak = [];
  for (const name of ['JWT_SECRET', 'MASTER_JWT_SECRET']) {
    if (!env[name]) missing.push(`${name} non impostata`);
    else if (env[name].length < MIN_SECRET_LENGTH) weak.push(`${name} troppo corta (minimo ${MIN_SECRET_LENGTH} caratteri)`);
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.MASTER_JWT_SECRET)
    weak.push('JWT_SECRET e MASTER_JWT_SECRET devono essere diversi');
  return { missing, weak };
}
