import { z } from 'zod';

// Chiavi di impostazione gestite dall'app. Una chiave nuova va aggiunta qui;
// se deve essere visibile anche senza login (menu pubblico), va anche in PUBLIC_SETTINGS_KEYS.
export const SETTINGS_KEYS = ['welcome_message'];
export const PUBLIC_SETTINGS_KEYS = ['welcome_message'];

export const settingKeySchema = z.enum(SETTINGS_KEYS);

export const settingValueSchema = z.object({
  value: z.string().max(2000).nullable(),
});
