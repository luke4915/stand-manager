import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatEuro, formatMin } from './useStatistics';

export function exportStatsPdf(stats, sessions, selectedSessionIds, terms) {
  const doc = new jsPDF();
  const scopeLabel = selectedSessionIds.length > 0
    ? sessions.filter(s => selectedSessionIds.includes(String(s.id))).map(s => s.name || s.id).join(', ')
    : (terms?.all ?? 'Tutte le sessioni');

  doc.setFontSize(16);
  doc.text('Report Statistiche — Stand Manager', 14, 16);
  doc.setFontSize(10);
  doc.text(`Ambito: ${scopeLabel}`, 14, 23);
  doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [['Indicatore', 'Valore']],
    body: [
      [terms?.total ?? 'Totale serata', formatEuro(stats.totaleSerata)],
      ['Importo medio ordine', formatEuro(stats.importoMedio)],
      ['Totale ordini', stats.numeroTotaleOrdini],
      ['Prodotto più venduto', stats.prodottoPiuVenduto || '—'],
      ['Guadagno non realizzato (omaggi)', formatEuro(stats.unrealizedGiftRevenue)],
      ['Ordini asporto', `${stats.takeawayCount} (${stats.pctTakeaway}%)`],
      ['Ordini in loco', stats.eatInCount],
      ['Ordini annullati/storni', `${stats.canceledCount} — ${formatEuro(stats.totaleStornato)}`],
      ['Tempo medio completamento', formatMin(stats.tempoMedioCompletamento)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
  });

  if (stats.incassoPerCategoria.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Categoria', 'Incasso']],
      body: stats.incassoPerCategoria.map(c => [c.categoria, formatEuro(c.totale)]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });
  }

  if (stats.topProdotti.length) {
    const top10 = [...stats.topProdotti].sort((a, b) => b.count - a.count).slice(0, 10);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Prodotto', 'Quantità', 'Incasso']],
      body: top10.map(p => [p.prodotto, p.count, formatEuro(p.revenue)]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });
  }

  if (stats.confrontoSerate.length > 1) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [[terms?.column ?? 'Sessione', 'Totale', 'Ordini', 'Medio']],
      body: stats.confrontoSerate.map(s => [s.name, formatEuro(s.totale), s.numero, formatEuro(s.medio)]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });
  }

  doc.save(`report_statistiche_${new Date().toISOString().slice(0, 10)}.pdf`);
}
