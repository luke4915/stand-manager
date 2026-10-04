// Password temporanea leggibile da dettare o scrivere a mano: niente caratteri ambigui (0/O, 1/l/I).
// L'utente la cambia al primo accesso, quindi conta più la chiarezza che la lunghezza.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 10;

export function generateTempPassword(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  // Si scartano i byte oltre il multiplo più grande della lunghezza dell'alfabeto: nessuna distorsione.
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < LENGTH) {
    for (const byte of random(LENGTH * 2)) {
      if (byte < limit && out.length < LENGTH) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}
