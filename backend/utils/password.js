import crypto from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

// Hash di una password casuale, generato all'avvio con lo stesso costo: il login lo confronta
// quando l'utente non esiste, così la risposta impiega lo stesso tempo di una password errata.
export const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), BCRYPT_COST);
