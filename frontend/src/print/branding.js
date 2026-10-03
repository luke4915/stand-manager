import { DEFAULT_BRANDING } from './templates.js';

// Impostazione del tenant (chiave receipt_*) → campo usato dai template.
const SETTING_TO_FIELD = {
  receipt_org_name: 'name',
  receipt_org_tax_code: 'taxCode',
  receipt_title: 'title',
  receipt_item_header: 'itemHeader',
  receipt_amount_header: 'amountHeader',
  receipt_total_label: 'totalLabel',
  receipt_legal_text: 'legalText',
};

export const RECEIPT_SETTING_KEYS = Object.keys(SETTING_TO_FIELD);

// Dalle impostazioni salvate sul server ai testi dello scontrino: un valore vuoto o mancante
// lascia il predefinito (per nome, codice fiscale e testo legale il predefinito è "niente").
export function brandingFromSettings(settings = {}) {
  const branding = { ...DEFAULT_BRANDING };
  for (const [key, field] of Object.entries(SETTING_TO_FIELD)) {
    const value = settings[key]?.trim();
    if (value) branding[field] = value;
  }
  return branding;
}
