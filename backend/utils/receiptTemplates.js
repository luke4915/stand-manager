import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EposXmlPrinter } from "./eposXmlPrinter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_DIR = path.join(__dirname, "..", "tmp");
let tmpDirEnsured = false;

const LINE_WIDTH = 42;
const DIVIDER = "=".repeat(LINE_WIDTH);
const DIVIDER_THIN = "-".repeat(LINE_WIDTH);
const HEADER_LOGO_WIDTH = 512;

const ASSOCIAZIONE_NOME = "APS MARIA SS DI TROCCHIO";
const ASSOCIAZIONE_CF = "C.F. 90051130608";

const SIDE_IMG_WIDTH = 125;
const TOTAL_PRINTER_WIDTH = 512;

let _sideImgBase = null;
async function getSideImgBase(sideImgPath) {
  if (_sideImgBase) return _sideImgBase;
  const sharp = (await import('sharp')).default;
  const buf = await sharp(sideImgPath).resize({ width: SIDE_IMG_WIDTH }).toBuffer();
  const meta = await sharp(buf).metadata();
  const h = (meta.height || 90) + 60;
  const svgW = TOTAL_PRINTER_WIDTH - (SIDE_IMG_WIDTH * 2);
  const resized = await sharp(sideImgPath)
    .resize({ width: SIDE_IMG_WIDTH, height: h, fit: 'contain', background: '#ffffff' })
    .toBuffer();
  _sideImgBase = { resized, h, svgW };
  return _sideImgBase;
}

export async function renderNumberSlip(printer, orderData) {
  const sideImgPath = path.join(__dirname, '..', 'assets', 'Gemini_Generated_Image_fxfw0dfxfw0dfxfw.png');

  printer.align('CT')
    .size(2, 2)
    .style('B')
    .text('IL TUO NUMERO ORDINE:')
    .size(1, 1)
    .style('NORMAL');

  printer.feed(1);

  if (fs.existsSync(sideImgPath)) {
    try {
      const sharp = (await import('sharp')).default;
      const { resized: sideImgResized, h, svgW } = await getSideImgBase(sideImgPath);

      const svgText = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${h}">
          <rect width="${svgW}" height="${h}" fill="#ffffff"/>
          <text x="${svgW / 2}" y="${h * 0.50}" font-size="${(h - 45) * 0.70}" font-weight="bold"
                text-anchor="middle" fill="black" font-family="monospace"> ${orderData.display_code} </text>
          <text x="${svgW / 2}" y="${h * 0.95}" font-size="40" font-style="italic" font-weight="600"
                text-anchor="middle" fill="black" font-family="sans-serif">Buon appetito!</text>
        </svg>
      `;
      const numBuf = await sharp(Buffer.from(svgText)).png().toBuffer();

      const composite = await sharp({
        create: {
          width: TOTAL_PRINTER_WIDTH,
          height: h,
          channels: 4,
          background: "#ffffff"
        }
      })
        .composite([
          { input: sideImgResized, left: 0, top: 0 },
          { input: numBuf, left: SIDE_IMG_WIDTH, top: 0 },
          { input: sideImgResized, left: SIDE_IMG_WIDTH + svgW, top: 0 },
        ])
        .png()
        .toBuffer();

      await printer.image(composite, { align: 'center', width: TOTAL_PRINTER_WIDTH });

    } catch (printErr) {
      console.error("Errore generazione Sharp, fallback su testo:", printErr);
      printer.align('CT').size(4, 4).style('B').text(`# ${orderData.display_code} #`).size(1, 1).style('NORMAL');
    }
  } else {
    printer.align('CT').size(4, 4).style('B').text(`# ${orderData.display_code} #`).size(1, 1).style('NORMAL');
  }

  printer.feed(2);
  printer.cut();
}

async function renderTopHeaderImage(printer, displayCode) {
  const sideImgPath = path.join(__dirname, '..', 'assets', 'Gemini_Generated_Image_fxfw0dfxfw0dfxfw.png');

  if (fs.existsSync(sideImgPath)) {
    try {
      const sharp = (await import('sharp')).default;
      const { resized: sideImgResized, h, svgW } = await getSideImgBase(sideImgPath);

      const svgText = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${h}">
          <rect width="${svgW}" height="${h}" fill="#ffffff"/>
          <text x="${svgW / 2}" y="${h * 0.15}" font-size="28" font-weight="600"
                text-anchor="middle" fill="black" font-family="sans-serif">NUMERO ORDINE:</text>
          <text x="${svgW / 2}" y="${h * 0.95}" font-size="${(h - 45) * 0.75}" font-weight="bold"
                text-anchor="middle" fill="black" font-family="monospace">${displayCode}</text>
        </svg>
      `;
      const numBuf = await sharp(Buffer.from(svgText)).png().toBuffer();

      const composite = await sharp({
        create: {
          width: TOTAL_PRINTER_WIDTH,
          height: h,
          channels: 4,
          background: "#ffffff"
        }
      })
        .composite([
          { input: sideImgResized, left: 0, top: 0 },
          { input: numBuf, left: SIDE_IMG_WIDTH, top: 0 },
          { input: sideImgResized, left: SIDE_IMG_WIDTH + svgW, top: 0 },
        ])
        .png()
        .toBuffer();

      await printer.image(composite, { align: 'center', width: TOTAL_PRINTER_WIDTH });
      printer.feed(1);
    } catch (err) {
      console.error("Errore generazione blocco grafico numero:", err);
    }
  }
}

function loadLogoBuffer(logoPath) {
  if (!logoPath || !fs.existsSync(logoPath)) return null;
  return fs.readFileSync(logoPath);
}

function wrapText(text, width) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    if ((current + word).length > width) {
      if (current) lines.push(current.trimEnd());
      current = word + " ";
    } else {
      current += word + " ";
    }
  });
  if (current.trim()) lines.push(current.trimEnd());
  return lines.length ? lines : [text.slice(0, width)];
}

function justifyRow(cols, width = LINE_WIDTH) {
  const n = cols.length;
  const gap = 1;
  const fixedSpace = gap * (n - 1);
  const otherWidths = cols.slice(1).map((c) => c.length);
  const firstWidth = Math.max(1, width - fixedSpace - otherWidths.reduce((a, b) => a + b, 0));

  const parts = [cols[0].slice(0, firstWidth).padEnd(firstWidth)];
  cols.slice(1).forEach((c) => parts.push(c));
  return parts.join(" ".repeat(gap));
}

function rowLR(left, right, width = LINE_WIDTH) {
  return justifyRow([left, right], width);
}

function rowThreeColumns(left, center, right, width = LINE_WIDTH) {
  const rightWidth = 8;
  const centerWidth = 4;
  const leftWidth = width - rightWidth - centerWidth - 2;

  const l = left.slice(0, leftWidth).padEnd(leftWidth);
  const c = center.padStart(centerWidth);
  const r = right.padStart(rightWidth);
  return `${l} ${c} ${r}`;
}

function encodeOrderId(orderId, timestamp) {
  let code = orderId.toString(36).toUpperCase().padStart(6, "0");
  if (timestamp) {
    const d = new Date(timestamp);
    code += String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
  }
  return `ORD${code}`;
}

function filterItems(items, destination) {
  if (destination === "all") return items;
  return items.filter((item) => (item.print_destination || "both") === "both" || (item.print_destination === destination));
}

async function renderHeader(printer, { title, logoPath, showLogo, subtitle = "", pickupStatus = null }) {
  if (showLogo && logoPath) {
    const logoBuf = loadLogoBuffer(logoPath);
    if (logoBuf) {
      try {
        printer.align("CT");
        await printer.image(logoBuf, { align: "center", width: HEADER_LOGO_WIDTH });
        printer.feed(1);
      } catch (err) {
        console.error("Errore stampa logo:", err.message);
      }
    }
  }

  printer.align("CT").style("B").text(ASSOCIAZIONE_NOME);
  printer.align("CT").style("NORMAL").text(ASSOCIAZIONE_CF);
  printer.align("CT").text(DIVIDER_THIN);

  printer.align("CT").style("B").text(title).style("NORMAL");
  printer.align("CT").text(DIVIDER_THIN);

  if (subtitle && !pickupStatus) {
    printer.align("CT").style("B").text(subtitle).style("NORMAL");
    printer.align("CT").text(DIVIDER_THIN);
  }

  printPickupBanner(printer, pickupStatus, subtitle);
}

function renderItems(printer, items, layoutType = "standard", bigFont = false) {
  if (layoutType === "customer") {
    printer.align("LT").text(rowThreeColumns("OMAGGIO", "QTA", "CONTRIB."));
    printer.align("CT").text(DIVIDER_THIN);

    const maxTextWidth = LINE_WIDTH - 8 - 4 - 2;
    items.forEach((item) => {
      const qty = String(item.quantity).trim();
      const priceUnit = parseFloat(item.price || 0);
      const rowTotal = `€ ${(priceUnit * item.quantity).toFixed(2)}`;

      const lines = wrapText(item.name.toUpperCase(), maxTextWidth);

      lines.forEach((line, i) => {
        if (i === 0) {
          printer.align("LT").text(rowThreeColumns(line, qty, rowTotal));
        } else {
          printer.align("LT").text(line);
        }
      });
      if (item.note) printer.align("LT").text(`  >> ${item.note}`);
    });
  } else {
    const headerText = layoutType === "association" ? "DESCRIZIONE" : "OMAGGIO";
    if (!bigFont) {
      printer.align("LT").text(rowLR(headerText, "QTA"));
      printer.align("CT").text(DIVIDER_THIN);
    }

    const maxTextWidth = LINE_WIDTH - 4;
    const isAssociation = layoutType === "association";
    items.forEach((item) => {
      const qty = String(item.quantity).trim();
      if (bigFont) {
        const maxW = Math.floor((LINE_WIDTH - qty.length - 2) / 2);
        const truncName = item.name.toUpperCase().slice(0, maxW);
        printer.align("LT").size(2, 2).style("B").text(`${qty}x ${truncName}`).size(1, 1).style("NORMAL");
        if (item.note) printer.align("LT").text(`  >> ${item.note}`);
        printer.align("CT").text(DIVIDER_THIN);
        return;
      }
      const lines = wrapText(item.name.toUpperCase(), maxTextWidth);
      lines.forEach((line, i) => {
        if (i === 0) {
          if (isAssociation) {
            printer.align("LT").text(rowLR(line, qty));
          } else {
            printer.align("LT").style("B").text(rowLR(line, qty)).style("NORMAL");
          }
        } else {
          printer.align("LT").text("  " + line);
        }
      });
      if (item.note) printer.align("LT").text(`  >> ${item.note}`);
    });
  }
  printer.align("CT").text(DIVIDER_THIN);
}

function printPickupBanner(printer, status, subtitle = "") {
  if (status !== "valid") return;
  let bannerText = "VALIDO PER IL RITIRO";
  if (subtitle.toUpperCase().includes("GASTRONOMIA") || subtitle.toUpperCase().includes("CUCINA")) bannerText = "RITIRO CUCINA";
  else if (subtitle.toUpperCase().includes("BAR")) bannerText = "RITIRO BAR";
  printer.align("CT").font("font_a").reverse(true);
  printer.size(2, 2).text(bannerText);
  printer.style("NORMAL").reverse(false).size(1, 1).font("font_a");
  printer.align("CT").text(DIVIDER_THIN);
}

async function renderFooter(printer, { total, QRcode, showTotal = false, showQR = false }) {
  if (showTotal && total !== null && total !== undefined) {
    printer.align("CT").style("B").text("TOTALE CONTRIBUTO VOLONTARIO").style("NORMAL");
    printer.align("CT").style("B").size(2, 2).text(`€ ${parseFloat(total).toFixed(2)}`).size(1, 1).style("NORMAL");
    printer.align("CT").text(DIVIDER_THIN);

    printer.align("CT").text("Raccolta fondi occasionale ai");
    printer.align("CT").text("sensi dell'art.7 D.Lgs.117/17");
    printer.align("CT").text("L'omaggio gastronomico è offerto");
    printer.align("CT").text("come mero ringraziamento.");
    printer.align("CT").text(DIVIDER_THIN);
  }

  if (QRcode) {
    if (showQR) {
      printer.align("CT").text("Mostra questo QR Code al ritiro:");
      printer.feed(1);
      printer.align("CT");
      printer.qrcode(QRcode, { model: "model2", level: "level_l", width: 3 });
      printer.feed(1);
    } else {
      printer.align("CT").text(`ID RITIRO: ${QRcode}`);
    }
  }

  printer.align("CT").text(DIVIDER);
  printer.align("CT").text("Powered by StandManager");
  printer.feed(2);
  printer.cut();
}

export async function renderCustomerEscpos(printer, orderData, logoPath, showLogo = false) {
  const ts = new Date(orderData.created_at);
  await renderHeader(printer, { title: "DOCUMENTO NON FISCALE", subtitle: "COPIA BENEFICIARIO", logoPath, showLogo, pickupStatus: "invalid" });
  renderItems(printer, orderData.items, "customer");
  if (orderData.is_takeaway) {
    printer.align('CT').style('B').text('[ DA ASPORTO ]').style('NORMAL');
    printer.align('CT').text(DIVIDER_THIN);
  }
  await renderFooter(printer, { total: orderData.total, QRcode: encodeOrderId(orderData.id, ts), showTotal: true, showQR: false });
}

export async function renderAssociationEscpos(printer, orderData, logoPath, showLogo = false) {
  const ts = new Date(orderData.created_at);
  await renderHeader(printer, { title: "DOCUMENTO NON FISCALE", subtitle: "COPIA INTERNA ASSOCIAZIONE", logoPath, showLogo });
  renderItems(printer, orderData.items, "association");
  await renderFooter(printer, { total: orderData.total, QRcode: encodeOrderId(orderData.id, ts), showTotal: true, showQR: false });
}

export async function renderKitchenEscpos(printer, orderData, logoPath, showLogo = false) {
  const items = filterItems(orderData.items, "kitchen");
  if (!items.length) return;
  await renderHeader(printer, { title: "=== COPIA CUCINA ===", logoPath, showLogo });
  renderItems(printer, items, "kitchen");
  await renderFooter(printer, {});
}

export async function renderGastronomyEscpos(printer, orderData, logoPath) {
  const items = filterItems(orderData.items, "kitchen");
  if (!items.length) return;

  await renderTopHeaderImage(printer, orderData.display_code);

  const ts = new Date(orderData.created_at || Date.now());

  if (orderData.is_takeaway) {
    printer.align('CT').reverse(true).size(2, 2).style('B')
      .text(' DA ASPORTO ')
      .size(1, 1).style('NORMAL').reverse(false);
    printer.align('CT').text(DIVIDER_THIN);
  }

  await renderHeader(printer, {
    title: "*** COPIA OMAGGIO GASTRONOMICO ***",
    logoPath,
    showLogo: false,
    subtitle: "RITIRO CUCINA",
    pickupStatus: "valid"
  });

  renderItems(printer, items, "gastronomy", true);
  await renderFooter(printer, { QRcode: encodeOrderId(orderData.id, ts), showQR: false });
}

export async function renderBarEscpos(printer, orderData, logoPath) {
  const items = filterItems(orderData.items, "bar");
  if (!items.length) return;

  await renderTopHeaderImage(printer, orderData.display_code);

  const ts = new Date(orderData.created_at || Date.now());

  await renderHeader(printer, {
    title: "*** COPIA OMAGGIO BAR ***",
    logoPath,
    showLogo: false,
    subtitle: "RITIRO BAR",
    pickupStatus: "valid"
  });

  renderItems(printer, items, "bar", true);
  await renderFooter(printer, { QRcode: encodeOrderId(orderData.id, ts), showQR: false });
}

export const templatesEscpos = {
  "Numeretto": renderNumberSlip,
  Cliente: renderCustomerEscpos,
  Associazione: renderAssociationEscpos,
  Cucina: renderKitchenEscpos,
  "Ritiro Gastronomia": renderGastronomyEscpos,
  "Ritiro Bar": renderBarEscpos
};

function resolvePrintTarget(setting, hostDefault, portDefault) {
  let templateFunc;
  if (typeof setting === "function") {
    templateFunc = setting;
  } else if (setting && typeof setting === "object") {
    templateFunc = templatesEscpos[setting.copy_type];
    if (!templateFunc) {
      console.warn(`Nessun template per: "${setting.copy_type}"`);
      return null;
    }
  } else {
    return null;
  }

  let host = hostDefault, port = portDefault;
  const addr = setting?.printer_address || "";
  if (addr) {
    const [h, p] = addr.split(":");
    host = h;
    if (p) port = parseInt(p, 10);
  }

  return {
    templateFunc,
    host,
    port,
    devid: setting?.printer_devid || "local_printer",
    showLogo: setting?.show_logo !== undefined ? setting.show_logo : true,
    showTimestamp: setting?.show_timestamp !== undefined ? setting.show_timestamp : false,
  };
}

export async function printESCPosNetwork(setting, orderData, eventName, logoPath, hostDefault = "127.0.0.1", portDefault = 443) {
  const target = resolvePrintTarget(setting, hostDefault, portDefault);
  if (!target) return;

  if (!tmpDirEnsured) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    tmpDirEnsured = true;
  }

  const printer = new EposXmlPrinter();
  console.time("render");
  await target.templateFunc(printer, orderData, logoPath, target.showLogo, target.showTimestamp);
  console.timeEnd("render");
  if (!printer.elements.length) return;

  console.time("send");
  await printer.send(target.host, { devid: target.devid, port: target.port });
  console.timeEnd("send");
  console.log(`[STAMPA] Completata su: ${target.host}:${target.port} (devid=${target.devid})`);
}

export async function printOrderBatch(settingsArray, orderData, logoPath, hostDefault = "127.0.0.1", portDefault = 443) {
  if (!tmpDirEnsured) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    tmpDirEnsured = true;
  }

  const groups = new Map();

  for (const setting of settingsArray) {
    const target = resolvePrintTarget(setting, hostDefault, portDefault);
    if (!target) continue;
    const key = `${target.host}:${target.port}:${target.devid}`;
    if (!groups.has(key)) groups.set(key, { host: target.host, port: target.port, devid: target.devid, targets: [] });
    groups.get(key).targets.push(target);
  }

  await Promise.all(
    [...groups.values()].map(async (group) => {
      const printer = new EposXmlPrinter();
      console.time(`render[${group.host}:${group.port}]`);
      for (const target of group.targets) {
        await target.templateFunc(printer, orderData, logoPath, target.showLogo, target.showTimestamp);
      }
      console.timeEnd(`render[${group.host}:${group.port}]`);
      if (!printer.elements.length) return;

      console.time(`send[${group.host}:${group.port}]`);
      await printer.send(group.host, { devid: group.devid, port: group.port });
      console.timeEnd(`send[${group.host}:${group.port}]`);
      console.log(`[STAMPA] Batch di ${group.targets.length} copie completato su: ${group.host}:${group.port} (devid=${group.devid})`);
    })
  );
}