import { inTransaction } from '../db.js';
import { HttpError } from './httpError.js';
import { hashPassword } from './password.js';
import { invalidateUserStatus } from './userStatus.js';

// Gestione degli utenti di un tenant, condivisa dall'admin del tenant (routes/auth.js) e dal master (routes/master.js).
// `db` è sempre una connessione già legata al tenant (app.tenant_id impostato): la RLS isola i dati.

// Il ruolo master ha una policy di sola lettura su TUTTI gli utenti (migrazione 025, per contarli): sommata a quella
// di isolamento, una SELECT non sarebbe limitata al tenant. Ogni query qui filtra quindi esplicitamente sul tenant corrente.
const IN_TENANT = "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int";

const USER_COLUMNS = 'id, username, role, must_change_password, (password_hash IS NOT NULL) AS has_password';

export async function listUsers(db) {
  const { rows } = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE ${IN_TENANT} ORDER BY username`);
  return rows;
}

// Prima cosa di ogni modifica: blocca tutti gli admin del tenant, sempre in ordine di id. Così due admin che si
// modificano a vicenda si mettono in fila invece di incrociare i lock (deadlock), e chi modifica due admin insieme
// non può lasciare il tenant senza amministratori. Ritorna gli id degli admin.
async function lockAdmins(db) {
  const { rows } = await db.query(`SELECT id FROM users WHERE role = 'admin' AND ${IN_TENANT} ORDER BY id FOR UPDATE`);
  return rows.map(r => r.id);
}

async function loadUser(db, userId) {
  const { rows } = await db.query(`SELECT id, username, role FROM users WHERE id = $1 AND ${IN_TENANT} FOR UPDATE`, [userId]);
  if (!rows.length) throw new HttpError(404, 'Utente non trovato');
  return rows[0];
}

// Crea un utente con password temporanea (da cambiare al primo accesso). Username già usato nel tenant: 409.
export async function createUser(db, tenantId, { username, role, password }) {
  try {
    const { rows } = await db.query(
      'INSERT INTO users (username, role, tenant_id, password_hash, must_change_password) VALUES ($1, $2, $3, $4, true) RETURNING id, username, role',
      [username, role, tenantId, await hashPassword(password)]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Username già esistente', 'USERNAME_TAKEN');
    throw err;
  }
}

// Cambia ruolo e/o username. Restituisce l'utente aggiornato.
export async function updateUser(client, tenantId, userId, { role, username }) {
  const user = await inTransaction(client, async (db) => {
    const admins = await lockAdmins(db);
    const current = await loadUser(db, userId);
    if (role && role !== current.role && current.role === 'admin' && admins.length === 1)
      throw new HttpError(409, 'Deve restare almeno un amministratore', 'LAST_ADMIN');
    try {
      const { rows } = await db.query(
        `UPDATE users SET role = COALESCE($2, role), username = COALESCE($3, username) WHERE id = $1 AND ${IN_TENANT} RETURNING ${USER_COLUMNS}`,
        [userId, role ?? null, username ?? null]
      );
      return { ...rows[0], previous: { role: current.role, username: current.username } };
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Username già esistente', 'USERNAME_TAKEN');
      throw err;
    }
  });
  invalidateUserStatus(tenantId, userId);
  return user;
}

export async function deleteUser(client, tenantId, userId) {
  const user = await inTransaction(client, async (db) => {
    const admins = await lockAdmins(db);
    const current = await loadUser(db, userId);
    if (current.role === 'admin' && admins.length === 1)
      throw new HttpError(409, 'Deve restare almeno un amministratore', 'LAST_ADMIN');
    await db.query(`DELETE FROM users WHERE id = $1 AND ${IN_TENANT}`, [userId]);
    return current;
  });
  invalidateUserStatus(tenantId, userId);
  return user;
}

// Password temporanea: l'utente deve cambiarla al primo accesso, anche se è già collegato (vedi authenticate). Serve anche a sbloccare gli account senza password.
export async function resetUserPassword(db, tenantId, userId, password) {
  const { rows } = await db.query(
    `UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2 AND ${IN_TENANT} RETURNING id, username`,
    [await hashPassword(password), userId]
  );
  if (!rows.length) throw new HttpError(404, 'Utente non trovato');
  invalidateUserStatus(tenantId, userId);
  return rows[0];
}
