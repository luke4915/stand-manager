import { z } from 'zod';
import { ROLES } from '../middleware/authenticate.js';

const username = z.string().trim().min(1).max(50);

export const passwordSchema = z.string().min(8, 'Password troppo corta (min 8 caratteri)').max(200);

export const loginSchema = z.object({
    username,
    password: z.string().min(1, 'Inserisci la password').max(200),
});

// La password è temporanea: l'utente deve cambiarla al primo accesso.
export const createUserSchema = z.object({
    username,
    role: z.enum(ROLES).default('cassa'),
    password: passwordSchema,
});

export const resetPasswordSchema = z.object({
    password: passwordSchema,
});

// Almeno un campo da cambiare.
export const updateUserSchema = z.object({
    role: z.enum(ROLES).optional(),
    username: username.optional(),
}).refine(v => v.role !== undefined || v.username !== undefined, { message: 'Niente da modificare' });

export const changeUsernameSchema = z.object({
    newUsername: username,
});

// La password attuale (anche quella temporanea del primo accesso) è sempre richiesta.
export const changePasswordSchema = z.object({
    oldPassword: z.string().min(1, 'Inserisci la password attuale').max(200),
    newPassword: passwordSchema,
});
