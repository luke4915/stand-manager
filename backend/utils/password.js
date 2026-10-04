import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);
