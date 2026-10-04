import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EposBuilder } from './eposBuilder.js';
import { TEMPLATES, DEFAULT_BRANDING, wrapText, encodeOrderId, filterItems } from './templates.js';
import { brandingFromSettings, imagesFromSettings } from './branding.js';
import { buildCopyPreviews } from './copyPreviews.js';
import { renderReceipt, renderReceiptParts } from './preview.js';
import { buildPrintJobs, parseAddress } from './print.js';
import { eposDriver, PrintError } from './drivers/epos.js';

const NO_IMAGES = { logo: () => null, numberBanner: () => null };
const ctx = { branding: { ...DEFAULT_BRANDING, name: 'ASSOCIAZIONE PROVA', taxCode: 'C.F. 123' }, images: NO_IMAGES, showLogo: true };

const order = {
  id: 'A12', display_code: 'A12', created_at: '2026-10-03T14:05:09', total: 23.5, is_takeaway: false,
  items: [
    { id: 1, name: 'Panino', quantity: 2, price: 5, note: 'senza cipolla', print_destination: 'kitchen' },
    { id: 2, name: 'Birra', quantity: 3, price: 4.5, print_destination: 'bar' },
  ],
};
const barOnly = { ...order, items: [order.items[1]] };

const render = async (copy, o = order, c = ctx) => {
  const b = new EposBuilder();
  await TEMPLATES[copy](b, o, c);
  return b.buildXml();
};

test('il builder protegge i caratteri speciali nell\'XML', () => {
  const xml = new EposBuilder().text('Acqua <&> 1').buildXml();
  assert.ok(xml.includes('Acqua &lt;&amp;&gt; 1'));
});

test('copia cliente: intestazione, righe, totale e identificativo di ritiro', async () => {
  const xml = await render('Cliente');
  for (const part of ['ASSOCIAZIONE PROVA', 'C.F. 123', 'PANINO', '€ 10.00', '€ 23.50', 'ID RITIRO: ORD000A12140509']) {
    assert.ok(xml.includes(part), `manca: ${part}`);
  }
});

test('senza dati dell\'associazione l\'intestazione non li stampa', async () => {
  const xml = await render('Cliente', order, { ...ctx, branding: DEFAULT_BRANDING });
  assert.ok(!xml.includes('ASSOCIAZIONE PROVA') && !xml.includes('C.F.'));
  assert.ok(xml.includes('DOCUMENTO NON FISCALE'));
});

test('titoli, etichetta del totale e testo legale vengono dalla configurazione del tenant', async () => {
  const branding = {
    ...ctx.branding, title: 'RICEVUTA', itemHeader: 'PRODOTTO', amountHeader: 'EURO', totalLabel: 'TOTALE OFFERTA',
    legalText: 'Prima riga legale\n\n  Seconda riga legale  ',
  };
  const xml = await render('Cliente', order, { ...ctx, branding });
  for (const part of ['RICEVUTA', 'PRODOTTO', 'EURO', 'TOTALE OFFERTA', 'Prima riga legale', 'Seconda riga legale']) {
    assert.ok(xml.includes(part), `manca: ${part}`);
  }
  for (const gone of ['DOCUMENTO NON FISCALE', 'CONTRIBUTO VOLONTARIO', 'D.Lgs.117', 'BENEFICIARIO']) {
    assert.ok(!xml.includes(gone), `non deve esserci: ${gone}`);
  }
});

test('senza testo legale configurato non si stampa nulla di legale', async () => {
  const xml = await render('Cliente');
  assert.ok(xml.includes('TOTALE') && !xml.includes('Raccolta fondi'));
});

test('brandingFromSettings: i valori vuoti o mancanti lasciano il predefinito', () => {
  assert.deepEqual(brandingFromSettings({}), DEFAULT_BRANDING);
  const b = brandingFromSettings({ receipt_org_name: ' Pro Loco ', receipt_title: '', receipt_total_label: '   ', receipt_legal_text: 'Testo' });
  assert.equal(b.name, 'Pro Loco');
  assert.equal(b.title, DEFAULT_BRANDING.title);
  assert.equal(b.totalLabel, DEFAULT_BRANDING.totalLabel);
  assert.equal(b.legalText, 'Testo');
});

test('numeretto senza immagini ripiega sul testo grande', async () => {
  assert.ok((await render('Numeretto')).includes('# A12 #'));
});

test('la copia cucina contiene solo le righe di cucina; ordine di soli prodotti bar: vuota', async () => {
  const xml = await render('Cucina');
  assert.ok(xml.includes('PANINO') && !xml.includes('BIRRA'));
  assert.equal(new EposBuilder().isEmpty, true);
  const b = new EposBuilder();
  await TEMPLATES.Cucina(b, barOnly, ctx);
  assert.equal(b.isEmpty, true);
});

test('wrapText, filterItems ed encodeOrderId', () => {
  assert.deepEqual(wrapText('uno due tre', 7), ['uno due', 'tre']);
  assert.equal(filterItems(order.items, 'bar').length, 1);
  assert.equal(filterItems(order.items, 'all').length, 2);
  assert.equal(encodeOrderId('A1'), 'ORD0000A1');
});

test('indirizzo: porta 443 se omessa', () => {
  assert.deepEqual(parseAddress('192.168.1.50'), { host: '192.168.1.50', port: 443 });
  assert.deepEqual(parseAddress('192.168.1.50:9443'), { host: '192.168.1.50', port: 9443 });
});

test('copie sulla stessa stampante in un unico documento; stampanti diverse in documenti separati', async () => {
  const settings = [
    { copy_type: 'Cliente', printer_address: '10.0.0.5', enabled: true },
    { copy_type: 'Cucina', printer_address: '10.0.0.5:443', enabled: true },
    { copy_type: 'Associazione', printer_address: '10.0.0.6', enabled: true },
  ];
  const jobs = await buildPrintJobs(settings, order, ctx);
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.find(j => j.host === '10.0.0.5').copies, ['Cliente', 'Cucina']);
});

test('copie disabilitate, senza indirizzo o sconosciute non stampano; documenti vuoti si scartano', async () => {
  const settings = [
    { copy_type: 'Cliente', printer_address: '10.0.0.5', enabled: false },
    { copy_type: 'Cucina', printer_address: '', enabled: true },
    { copy_type: 'Inesistente', printer_address: '10.0.0.5', enabled: true },
    { copy_type: 'Cucina', printer_address: '10.0.0.7', enabled: true },
  ];
  assert.equal((await buildPrintJobs(settings.slice(0, 3), order, ctx)).length, 0);
  assert.equal((await buildPrintJobs(settings, barOnly, ctx)).length, 0);
});

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const respond = (body) => { globalThis.fetch = async () => ({ text: async () => body }); };

test('driver Epson: successo, rifiuto della stampante, rete assente', async () => {
  const builder = new EposBuilder().text('prova');
  const target = { host: '10.0.0.5' };

  let called;
  globalThis.fetch = async (url, init) => { called = { url, init }; return { text: async () => '<response success="true" code=""/>' }; };
  await eposDriver.send(builder, target);
  assert.equal(called.url, 'https://10.0.0.5:443/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000');
  assert.equal(called.init.method, 'POST');

  respond('<response success="false" code="EPTR_COVER_OPEN"/>');
  await assert.rejects(eposDriver.send(builder, target), (e) => e instanceof PrintError && e.message.includes('EPTR_COVER_OPEN'));

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(eposDriver.send(builder, target), (e) => e instanceof PrintError && e.retryable);
});

test('imagesFromSettings: data URL del tenant, null se mancano', () => {
  assert.deepEqual(imagesFromSettings({}), { logoUrl: null, sideImageUrl: null });
  assert.deepEqual(imagesFromSettings({ receipt_logo: 'data:image/png;base64,AAAA', receipt_side_image: '' }), { logoUrl: 'data:image/png;base64,AAAA', sideImageUrl: null });
});

test('renderReceipt disegna testo, allineamento, immagini, QR e taglio', () => {
  const xml = new EposBuilder().align('CT').text('CIAO').align('LT').text('a sinistra')
    .image({ width: 512, height: 90, b64: 'AAAA' }, { align: 'center' }).qrcode('XYZ').cut().buildXml();
  const out = renderReceipt(xml);
  assert.match(out, /\|\s+CIAO\s+\|/);
  assert.match(out, /\|a sinistra\s+\|/);
  assert.match(out, /\[immagine 512x90px\]/);
  assert.match(out, /\[qrcode: XYZ\]/);
  assert.match(out, /taglio/);
});

test('renderReceiptParts separa il testo dalle immagini, in ordine, con i dati a 1 bit', () => {
  const xml = new EposBuilder().text('SOPRA').image({ width: 8, height: 2, b64: 'qrs=' }, { align: 'center' }).text('SOTTO').cut().buildXml();
  const parts = renderReceiptParts(xml);
  assert.equal(parts.length, 3);
  assert.match(parts[0].text, /SOPRA/);
  assert.deepEqual(parts[1], { image: { width: 8, height: 2, b64: 'qrs=' } });
  assert.match(parts[2].text, /SOTTO[\s\S]*✂/);
  assert.ok(!parts[0].text.includes('immagine'));
});

test('anteprima delle copie: usa testi e immagini del tenant e salta le copie vuote', async () => {
  const images = {
    logo: () => ({ width: 512, height: 100, b64: 'AAAA' }),
    numberBanner: () => ({ width: 512, height: 150, b64: 'AAAA' }),
  };
  const branding = { ...DEFAULT_BRANDING, name: 'PRO LOCO PROVA', totalLabel: 'TOTALE OFFERTA' };
  const previews = await buildCopyPreviews(branding, images);
  assert.deepEqual(previews.map(p => p.name), ['Numeretto', 'Cliente', 'Associazione', 'Cucina', 'Ritiro Gastronomia', 'Ritiro Bar']);
  const cliente = previews.find(p => p.name === 'Cliente').text;
  assert.ok(cliente.includes('PRO LOCO PROVA') && cliente.includes('TOTALE OFFERTA') && cliente.includes('[immagine 512x100px]'));
  assert.ok(previews.find(p => p.name === 'Numeretto').text.includes('[immagine 512x150px]'));
});
