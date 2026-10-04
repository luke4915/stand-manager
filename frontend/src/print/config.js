import { db } from '../offline/db';
import { fetchWithAuth } from '../utils/apiClient';
import { brandingFromSettings, imagesFromSettings } from './branding.js';

// Configurazione di stampa del tenant (copie → stampanti e testi dello scontrino), conservata
// in locale: alla cassa serve anche quando il server non è raggiungibile.
const KEY = 'printConfig';

export async function getPrintConfig() {
  return (await db.meta.get(KEY)) ?? null;
}

// Scarica la configurazione dal server e la salva. Chiamala all'avvio, al ritorno online e dopo ogni modifica.
export async function refreshPrintConfig() {
  const [rows, settings] = await Promise.all([fetchWithAuth('/print-settings'), fetchWithAuth('/settings/all')]);
  const config = {
    key: KEY,
    settings: rows.map(r => ({ copy_type: r.copy_type_name, printer_address: r.printer_address, enabled: r.enabled })),
    branding: brandingFromSettings(settings),
    images: imagesFromSettings(settings),
  };
  await db.meta.put(config);
  return config;
}
