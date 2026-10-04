import { z } from 'zod';
import { passwordSchema } from './authSchema.js';
import { idSchema } from './common.js';
import { RECEIPT_SETTINGS_KEYS } from './settingsSchema.js';
import { MODULE_IDS, BUSINESS_TYPE_IDS, firstModuleNotAllowed } from '../utils/modules.js';

const businessType = z.enum(BUSINESS_TYPE_IDS);
const modules = z.array(z.enum(MODULE_IDS)).max(MODULE_IDS.length);

export const masterLoginSchema = z.object({
  password: z.string().min(1),
});

export const createTenantSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'solo lettere minuscole, numeri e trattini').max(50),
  name: z.string().trim().min(1).max(100),
  plan: z.string().trim().min(1).max(30).default('trial'),
  // senza `modules` valgono quelli proposti dal tipo di attività
  businessType: businessType.default('sagra'),
  modules: modules.optional(),
  expiresInDays: z.coerce.number().int().positive().max(3650).nullish(),
  adminUsername: z.string().trim().min(1).max(50),
  // temporanea: l'admin la cambia al primo accesso
  adminPassword: passwordSchema,
}).superRefine((data, ctx) => {
  const notAllowed = data.modules && firstModuleNotAllowed(data.businessType, data.modules);
  if (notAllowed) ctx.addIssue({ code: 'custom', path: ['modules'], message: `il modulo "${notAllowed}" non esiste per questo tipo di attività` });
});

// Moduli di un tenant esistente: sostituisce l'insieme. Il tipo di attività non cambia dopo la creazione
// (sagra e ristorante sono due prodotti diversi); la route controlla che i moduli esistano per il suo tipo.
export const tenantModulesSchema = z.object({
  modules,
});

export const extendLicenseSchema = z.object({
  days: z.coerce.number().int().positive().max(3650),
});

export const tenantActiveSchema = z.object({
  active: z.boolean(),
});

export const deleteTenantSchema = z.object({
  confirmSlug: z.string().min(1),
});

// Personalizzazione degli scontrini di un tenant: sostituisce l'insieme dei valori. Un campo vuoto o
// assente torna al predefinito. Le immagini arrivano già ridotte e in bianco e nero (data URL PNG).
const text = (max) => z.string().trim().max(max).nullish().transform(v => v || null);
const image = z.string().max(150_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, 'immagine non valida (serve un PNG)')
  .nullish().transform(v => v || null);

const RECEIPT_FIELD_SCHEMAS = {
  receipt_org_name: text(100),
  receipt_org_tax_code: text(100),
  receipt_title: text(100),
  receipt_item_header: text(30),
  receipt_amount_header: text(30),
  receipt_total_label: text(50),
  receipt_legal_text: text(2000),
  receipt_logo: image,
  receipt_side_image: image,
};

// Controllo di coerenza: ogni chiave dello scontrino deve avere il suo schema, e viceversa.
if (RECEIPT_SETTINGS_KEYS.some(k => !(k in RECEIPT_FIELD_SCHEMAS)) || Object.keys(RECEIPT_FIELD_SCHEMAS).length !== RECEIPT_SETTINGS_KEYS.length) {
  throw new Error('masterSchema: le chiavi receipt_* non coincidono con settingsSchema');
}

export const receiptCustomizationSchema = z.object(RECEIPT_FIELD_SCHEMAS);

// Utenti di un tenant: /master/tenants/:id/users/:userId
export const tenantUserParamsSchema = z.object({ id: idSchema, userId: idSchema });
