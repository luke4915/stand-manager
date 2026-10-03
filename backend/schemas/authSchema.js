import { z } from 'zod';
import { ROLES } from '../middleware/authenticate.js';

const username = z.string().trim().min(1).max(50);

// Password vuota ammessa: al primo accesso l'utente non ne ha ancora una.
export const loginSchema = z.object({
    username,
    password: z.string().max(200).default(''),
});

export const createUserSchema = z.object({
    username,
    role: z.enum(ROLES).default('cassa'),
});

export const changeUsernameSchema = z.object({
    newUsername: username,
});

// La vecchia password serve solo se l'utente ne ha già una (primo accesso: nessuna).
export const changePasswordSchema = z.object({
    oldPassword: z.string().max(200).optional(),
    newPassword: z.string().min(6, 'Password troppo corta (min 6 caratteri)').max(200),
});
