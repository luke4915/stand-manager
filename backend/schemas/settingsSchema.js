import { z } from 'zod';

// Chiavi di impostazione gestite dall'app. Una chiave nuova va aggiunta qui;
// se deve essere visibile anche senza login (menu pubblico), va anche in PUBLIC_SETTINGS_KEYS.
//
// receipt_*: contenuto degli scontrini, per tenant (intestazione, titoli e testi legali).
// Sono private: le legge solo la cassa autenticata (GET /settings/all) e le salva in locale per stampare offline.
export const RECEIPT_SETTINGS_KEYS = [
  'receipt_org_name',     // intestazione: nome dell'organizzazione
  'receipt_org_tax_code', // intestazione: codice fiscale / partita IVA
  'receipt_title',        // titolo del documento (es. DOCUMENTO NON FISCALE)
  'receipt_item_header',  // titolo della colonna delle righe (es. ARTICOLO)
  'receipt_amount_header', // titolo della colonna degli importi (es. IMPORTO)
  'receipt_total_label',  // etichetta del totale (es. TOTALE)
  'receipt_legal_text',   // testo legale a piè di scontrino, una riga per riga di stampa
];

export const SETTINGS_KEYS = ['welcome_message', ...RECEIPT_SETTINGS_KEYS];
export const PUBLIC_SETTINGS_KEYS = ['welcome_message'];

export const settingParamsSchema = z.object({ key: z.enum(SETTINGS_KEYS) });

export const settingValueSchema = z.object({
  value: z.string().max(2000).nullable(),
});
