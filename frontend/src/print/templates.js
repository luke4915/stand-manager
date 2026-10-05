// Template delle copie (numeretto, cliente, associazione, cucina, ritiro gastronomia/bar).
// Scrivono su un builder (eposBuilder.js) e non conoscono rete né browser.
//
// ctx = {
//   branding: contenuto degli scontrini del tenant (vedi DEFAULT_BRANDING); nome e codice fiscale sono facoltativi
//   images:   { logo(), numberBanner(code, variant) }   raster o null: senza immagini si usa il testo
//   showLogo: boolean
// }
// order = { id, display_code, created_at, total, is_takeaway, items[] }; id è il codice ordine.

// Testi dello scontrino configurabili per tenant (impostazioni receipt_*). Quelli mancanti
// usano questi valori neutri; nome, codice fiscale e testo legale, se vuoti, non si stampano.
export const DEFAULT_BRANDING = {
  name: '',
  taxCode: '',
  title: 'DOCUMENTO NON FISCALE',
  itemHeader: 'ARTICOLO',
  amountHeader: 'IMPORTO',
  totalLabel: 'TOTALE',
  legalText: '',
};

const LINE_WIDTH = 42;
const DIVIDER = '='.repeat(LINE_WIDTH);
const DIVIDER_THIN = '-'.repeat(LINE_WIDTH);

export function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if ((current + word).length > width) {
      if (current) lines.push(current.trimEnd());
      current = word + ' ';
    } else {
      current += word + ' ';
    }
  });
  if (current.trim()) lines.push(current.trimEnd());
  return lines.length ? lines : [text.slice(0, width)];
}

function rowLR(left, right, width = LINE_WIDTH) {
  const firstWidth = Math.max(1, width - 1 - right.length);
  return `${left.slice(0, firstWidth).padEnd(firstWidth)} ${right}`;
}

function rowThreeColumns(left, center, right, width = LINE_WIDTH) {
  const rightWidth = 8;
  const centerWidth = 4;
  const leftWidth = width - rightWidth - centerWidth - 2;
  return `${left.slice(0, leftWidth).padEnd(leftWidth)} ${center.padStart(centerWidth)} ${right.padStart(rightWidth)}`;
}

// Identificativo di ritiro: ORD + codice ordine + ora (HHMMSS).
export function encodeOrderId(orderId, timestamp) {
  let code = orderId.toString(36).toUpperCase().padStart(6, '0');
  if (timestamp) {
    const d = new Date(timestamp);
    code += String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
  }
  return `ORD${code}`;
}

export function filterItems(items, destination) {
  if (destination === 'all') return items;
  return items.filter((item) => (item.print_destination || 'both') === 'both' || item.print_destination === destination);
}

function textBigNumber(printer, code) {
  printer.align('CT').size(4, 4).style('B').text(`# ${code} #`).size(1, 1).style('NORMAL');
}

export async function renderNumberSlip(printer, order, ctx) {
  printer.align('CT').size(2, 2).style('B').text('IL TUO NUMERO ORDINE:').size(1, 1).style('NORMAL');
  printer.feed(1);

  const banner = await ctx.images.numberBanner(order.display_code, 'slip');
  if (banner) printer.image(banner, { align: 'center' });
  else textBigNumber(printer, order.display_code);

  printer.feed(2);
  printer.cut();
}

// "TAVOLO T5 · 4 COPERTI" per le comande dei tavoli; nulla per gli ordini pagati subito.
export function tableLabel(order) {
  if (!order.table_name) return null;
  const covers = order.covers > 0 ? ` · ${order.covers} ${order.covers === 1 ? 'COPERTO' : 'COPERTI'}` : '';
  return `TAVOLO ${order.table_name}${covers}`.toUpperCase();
}

// Il tavolo in evidenza in cima alla copia, dove la cucina guarda per prima.
function renderTableBanner(printer, order) {
  const label = tableLabel(order);
  if (!label) return;
  printer.align('CT').reverse(true).size(2, 2).style('B').text(` ${label} `).size(1, 1).style('NORMAL').reverse(false);
  // La portata (comande dei tavoli divise per uscita): subito sotto il tavolo
  if (order.course_name) printer.align('CT').size(1, 2).style('B').text(String(order.course_name).toUpperCase()).size(1, 1).style('NORMAL');
  printer.align('CT').text(DIVIDER_THIN);
}

async function renderTopHeaderImage(printer, ctx, displayCode) {
  const banner = await ctx.images.numberBanner(displayCode, 'header');
  if (!banner) return;
  printer.image(banner, { align: 'center' });
  printer.feed(1);
}

async function renderHeader(printer, ctx, { title, subtitle = '', pickupStatus = null, showLogo = ctx.showLogo }) {
  if (showLogo) {
    const logo = await ctx.images.logo();
    if (logo) {
      printer.align('CT').image(logo, { align: 'center' });
      printer.feed(1);
    }
  }

  const { name, taxCode } = ctx.branding;
  if (name) printer.align('CT').style('B').text(name);
  if (taxCode) printer.align('CT').style('NORMAL').text(taxCode);
  if (name || taxCode) printer.align('CT').text(DIVIDER_THIN);

  printer.align('CT').style('B').text(title).style('NORMAL');
  printer.align('CT').text(DIVIDER_THIN);

  if (subtitle && !pickupStatus) {
    printer.align('CT').style('B').text(subtitle).style('NORMAL');
    printer.align('CT').text(DIVIDER_THIN);
  }

  printPickupBanner(printer, pickupStatus, subtitle);
}

function renderItems(printer, ctx, items, layoutType = 'standard', bigFont = false) {
  const { itemHeader, amountHeader } = ctx.branding;
  if (layoutType === 'customer') {
    printer.align('LT').text(rowThreeColumns(itemHeader, 'QTA', amountHeader));
    printer.align('CT').text(DIVIDER_THIN);

    const maxTextWidth = LINE_WIDTH - 8 - 4 - 2;
    items.forEach((item) => {
      const qty = String(item.quantity).trim();
      const rowTotal = `€ ${Number(item.line_total ?? parseFloat(item.price || 0) * item.quantity).toFixed(2)}`;
      wrapText(item.name.toUpperCase(), maxTextWidth).forEach((line, i) => {
        if (i === 0) printer.align('LT').text(rowThreeColumns(line, qty, rowTotal));
        else printer.align('LT').text(line);
      });
      if (item.note) printer.align('LT').text(`  >> ${item.note}`);
    });
  } else {
    if (!bigFont) {
      printer.align('LT').text(rowLR(itemHeader, 'QTA'));
      printer.align('CT').text(DIVIDER_THIN);
    }

    const maxTextWidth = LINE_WIDTH - 4;
    const isAssociation = layoutType === 'association';
    items.forEach((item) => {
      const qty = String(item.quantity).trim();
      if (bigFont) {
        const maxW = Math.floor((LINE_WIDTH - qty.length - 2) / 2);
        printer.align('LT').size(2, 2).style('B').text(`${qty}x ${item.name.toUpperCase().slice(0, maxW)}`).size(1, 1).style('NORMAL');
        if (item.note) printer.align('LT').text(`  >> ${item.note}`);
        printer.align('CT').text(DIVIDER_THIN);
        return;
      }
      wrapText(item.name.toUpperCase(), maxTextWidth).forEach((line, i) => {
        if (i === 0) {
          if (isAssociation) printer.align('LT').text(rowLR(line, qty));
          else printer.align('LT').style('B').text(rowLR(line, qty)).style('NORMAL');
        } else {
          printer.align('LT').text('  ' + line);
        }
      });
      if (item.note) printer.align('LT').text(`  >> ${item.note}`);
    });
  }
  printer.align('CT').text(DIVIDER_THIN);
}

function printPickupBanner(printer, status, subtitle = '') {
  if (status !== 'valid') return;
  let bannerText = 'VALIDO PER IL RITIRO';
  if (subtitle.toUpperCase().includes('GASTRONOMIA') || subtitle.toUpperCase().includes('CUCINA')) bannerText = 'RITIRO CUCINA';
  else if (subtitle.toUpperCase().includes('BAR')) bannerText = 'RITIRO BAR';
  printer.align('CT').font('font_a').reverse(true);
  printer.size(2, 2).text(bannerText);
  printer.style('NORMAL').reverse(false).size(1, 1).font('font_a');
  printer.align('CT').text(DIVIDER_THIN);
}

function renderFooter(printer, ctx, { total, pickupId, showTotal = false }) {
  const { totalLabel, legalText } = ctx.branding;
  if (showTotal && total !== null && total !== undefined) {
    printer.align('CT').style('B').text(totalLabel).style('NORMAL');
    printer.align('CT').style('B').size(2, 2).text(`€ ${parseFloat(total).toFixed(2)}`).size(1, 1).style('NORMAL');
    printer.align('CT').text(DIVIDER_THIN);

    const legalLines = legalText.split('\n').map(l => l.trim()).filter(Boolean).flatMap(l => wrapText(l, LINE_WIDTH));
    if (legalLines.length) {
      legalLines.forEach(line => printer.align('CT').text(line));
      printer.align('CT').text(DIVIDER_THIN);
    }
  }

  if (pickupId) printer.align('CT').text(`ID RITIRO: ${pickupId}`);

  printer.align('CT').text(DIVIDER);
  printer.align('CT').text('Powered by StandManager');
  printer.feed(2);
  printer.cut();
}

export async function renderCustomer(printer, order, ctx) {
  await renderHeader(printer, ctx, { title: ctx.branding.title });
  renderItems(printer, ctx, order.items, 'customer');
  if (order.is_takeaway) {
    printer.align('CT').style('B').text('[ DA ASPORTO ]').style('NORMAL');
    printer.align('CT').text(DIVIDER_THIN);
  }
  renderFooter(printer, ctx, { total: order.total, pickupId: encodeOrderId(order.id, new Date(order.created_at)), showTotal: true });
}

export async function renderAssociation(printer, order, ctx) {
  await renderHeader(printer, ctx, { title: ctx.branding.title, subtitle: 'COPIA INTERNA ASSOCIAZIONE' });
  renderItems(printer, ctx, order.items, 'association');
  renderFooter(printer, ctx, { total: order.total, pickupId: encodeOrderId(order.id, new Date(order.created_at)), showTotal: true });
}

export async function renderKitchen(printer, order, ctx) {
  const items = filterItems(order.items, 'kitchen');
  if (!items.length) return;
  renderTableBanner(printer, order);
  await renderHeader(printer, ctx, { title: '=== COPIA CUCINA ===' });
  renderItems(printer, ctx, items, 'kitchen');
  renderFooter(printer, ctx, {});
}

export async function renderGastronomy(printer, order, ctx) {
  const items = filterItems(order.items, 'kitchen');
  if (!items.length) return;

  await renderTopHeaderImage(printer, ctx, order.display_code);
  renderTableBanner(printer, order);

  if (order.is_takeaway) {
    printer.align('CT').reverse(true).size(2, 2).style('B').text(' DA ASPORTO ').size(1, 1).style('NORMAL').reverse(false);
    printer.align('CT').text(DIVIDER_THIN);
  }

  await renderHeader(printer, ctx, {
    title: '*** COPIA OMAGGIO GASTRONOMICO ***', subtitle: 'RITIRO CUCINA', pickupStatus: 'valid', showLogo: false,
  });
  renderItems(printer, ctx, items, 'gastronomy', true);
  renderFooter(printer, ctx, { pickupId: encodeOrderId(order.id, new Date(order.created_at || Date.now())) });
}

export async function renderBar(printer, order, ctx) {
  const items = filterItems(order.items, 'bar');
  if (!items.length) return;

  await renderTopHeaderImage(printer, ctx, order.display_code);
  renderTableBanner(printer, order);

  await renderHeader(printer, ctx, {
    title: '*** COPIA OMAGGIO BAR ***', subtitle: 'RITIRO BAR', pickupStatus: 'valid', showLogo: false,
  });
  renderItems(printer, ctx, items, 'bar', true);
  renderFooter(printer, ctx, { pickupId: encodeOrderId(order.id, new Date(order.created_at || Date.now())) });
}

const euro = (n) => `€ ${Number(n).toFixed(2)}`;
const METHOD_LABELS = { cash: 'Contanti', card: 'Carta', other: 'Altro' };

// Ricevuta NON fiscale di un conto di un tavolo (dati di GET /checks/:id/receipt): tutto il conto, oppure la quota
// di un solo pagamento. Non è una copia degli ordini: la stampa dal pannello del conto la invia alla stampante cliente.
export async function renderCheckReceipt(printer, receipt, ctx) {
  const { check, lines, payments, scope } = receipt;
  await renderHeader(printer, ctx, { title: scope === 'payment' ? 'RICEVUTA DI PAGAMENTO' : 'CONTO' });
  const where = [check.table_name && `Tavolo ${check.table_name}`, check.covers > 0 && `${check.covers} ${check.covers === 1 ? 'coperto' : 'coperti'}`, `Conto n. ${check.number}`]
    .filter(Boolean).join(' - ');
  printer.align('CT').text(where);
  printer.align('CT').text(DIVIDER_THIN);

  renderItems(printer, ctx, lines.map(l => ({ name: l.name, quantity: l.quantity, line_total: l.amount })), 'customer');

  if (scope === 'payment') {
    const [payment] = payments;
    printer.align('CT').style('B').text(`PAGATO ${METHOD_LABELS[payment.method] ?? payment.method}`).style('NORMAL');
    printer.align('CT').style('B').size(2, 2).text(euro(payment.amount)).size(1, 1).style('NORMAL');
    if (receipt.due > 0) printer.align('CT').text(`Residuo del conto: ${euro(receipt.due)}`);
  } else {
    printer.align('CT').style('B').text('TOTALE').style('NORMAL');
    printer.align('CT').style('B').size(2, 2).text(euro(receipt.total)).size(1, 1).style('NORMAL');
    if (payments.length) {
      printer.align('CT').text(DIVIDER_THIN);
      payments.forEach(p => printer.align('LT').text(rowLR(METHOD_LABELS[p.method] ?? p.method, euro(p.amount))));
      printer.align('LT').style('B').text(rowLR('Residuo', euro(receipt.due))).style('NORMAL');
    }
  }
  printer.align('CT').text(DIVIDER_THIN);
  printer.align('CT').text('DOCUMENTO NON FISCALE');
  printer.align('CT').text('Powered by StandManager');
  printer.feed(2);
  printer.cut();
}

// Nome della copia (copy_types.name) → template
export const TEMPLATES = {
  Numeretto: renderNumberSlip,
  Cliente: renderCustomer,
  Associazione: renderAssociation,
  Cucina: renderKitchen,
  'Ritiro Gastronomia': renderGastronomy,
  'Ritiro Bar': renderBar,
};
