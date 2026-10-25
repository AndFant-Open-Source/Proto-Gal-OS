// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import { NOME_ENTE } from '@/lib/ente';
import { stampigliaPdf, nomeFileStampigliato } from '@/lib/stampigliatura';
import { formatData, LABEL_FLUSSO } from '@/lib/utils';
import { dataDocumento } from '@/hooks/useFascicoli';
import type { DatiStampigliatura, DocumentoFascicolo, Fascicolo } from '@/types';

export interface AvanzamentoZip {
  fatto: number;
  totale: number;
}

/** Nome leggibile nello ZIP: si tolgono solo i caratteri non ammessi da Windows nei nomi di file */
const nomeNelloZip = (nome: string) => nome.replace(/[\\/:*?"<>|]/g, '_');

interface FileDaInserire {
  cartella: string;
  nome_file: string;
  storage_path: string;
  tipo_mime?: string;
  timbro: DatiStampigliatura;
}

function indicePdf(fascicolo: Fascicolo, documenti: DocumentoFascicolo[]): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(`${NOME_ENTE} — Fascicolo ${fascicolo.numero_completo}`, 14, 16);
  doc.setFontSize(10);
  const righeIntestazione = [
    `Oggetto: ${fascicolo.oggetto}`,
    fascicolo.titolario ? `Classificazione: ${fascicolo.titolario.codice} ${fascicolo.titolario.descrizione}` : '',
    fascicolo.responsabile ? `Responsabile: ${fascicolo.responsabile}` : '',
    fascicolo.riferimento_esterno ? `Riferimento esterno: ${fascicolo.riferimento_esterno}` : '',
    `Aperto il ${formatData(fascicolo.data_apertura)}` +
      (fascicolo.data_chiusura ? ` — chiuso il ${formatData(fascicolo.data_chiusura)}` : ' — aperto'),
    `Indice generato il ${formatData(new Date().toISOString(), true)}`,
  ].filter(Boolean);
  righeIntestazione.forEach((riga, i) => doc.text(doc.splitTextToSize(riga, 265)[0] as string, 14, 24 + i * 5));

  autoTable(doc, {
    startY: 26 + righeIntestazione.length * 5,
    head: [['#', 'Numero', 'Data', 'Tipo', 'Oggetto', 'Mittente / destinatario / contraente', 'File']],
    body: documenti.map((d, i) => {
      const p = d.protocollo;
      const c = d.contratto;
      return [
        String(i + 1),
        p?.numero_completo ?? c?.numero_completo ?? '—',
        formatData(dataDocumento(d), true),
        p ? `Protocollo ${LABEL_FLUSSO[p.tipo_flusso]}` : 'Contratto',
        p?.oggetto ?? c?.oggetto ?? '',
        p ? (p.tipo_flusso === 'arrivo' ? p.mittente_nome : p.destinatario_nome) ?? '' : c?.contraente_nome ?? '',
        String((p?.protocollo_allegati ?? c?.protocollo_contratti_allegati ?? []).length),
      ];
    }),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 51, 153] },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 28 }, 2: { cellWidth: 28 }, 6: { cellWidth: 12 } },
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * ZIP del fascicolo: indice PDF e una cartella per documento, nell'ordine della pratica.
 * I PDF sono timbrati con il numero (come lo scaricamento singolo); gli altri file restano originali.
 */
export async function creaZipFascicolo(
  fascicolo: Fascicolo,
  documenti: DocumentoFascicolo[],
  avanza: (a: AvanzamentoZip) => void,
): Promise<{ zip: Blob; nonInclusi: string[] }> {
  const file: FileDaInserire[] = [];
  documenti.forEach((d, i) => {
    const numero = d.protocollo?.numero_completo ?? d.contratto?.numero_completo ?? 'documento';
    const cartella = `${String(i + 1).padStart(3, '0')}_${numero.replace(/\//g, '-')}`;
    const timbro: DatiStampigliatura = d.protocollo
      ? { nome_gal: NOME_ENTE, numero_protocollo: numero, tipo_flusso: d.protocollo.tipo_flusso, data_stampa: new Date().toISOString() }
      : { nome_gal: NOME_ENTE, numero_protocollo: numero, registro: 'repertorio', data_stampa: new Date().toISOString() };
    for (const a of d.protocollo?.protocollo_allegati ?? d.contratto?.protocollo_contratti_allegati ?? []) {
      file.push({ cartella, nome_file: a.nome_file, storage_path: a.storage_path, tipo_mime: a.tipo_mime, timbro });
    }
  });

  const contenuto: Zippable = {};
  const nonInclusi: string[] = [];
  for (let i = 0; i < file.length; i++) {
    avanza({ fatto: i, totale: file.length });
    const f = file[i];
    const { data, error } = await supabase.storage.from('allegati-protocollo').download(f.storage_path);
    if (error || !data) {
      nonInclusi.push(`${f.timbro.numero_protocollo} — ${f.nome_file}`);
      continue;
    }
    const isPdf = f.tipo_mime === 'application/pdf' || f.nome_file.toLowerCase().endsWith('.pdf');
    let bytes: Uint8Array = new Uint8Array(await data.arrayBuffer());
    let nome = nomeNelloZip(f.nome_file);
    if (isPdf) {
      try {
        bytes = await stampigliaPdf(bytes.slice().buffer as ArrayBuffer, f.timbro);
        nome = nomeNelloZip(nomeFileStampigliato(f.timbro.numero_protocollo, f.nome_file));
      } catch {
        // PDF protetto o danneggiato: si include l'originale senza timbro
      }
    }
    // Nomi uguali nella stessa cartella: suffisso numerico
    let percorso = `${f.cartella}/${nome}`;
    for (let n = 2; percorso in contenuto; n++) percorso = `${f.cartella}/${n}_${nome}`;
    contenuto[percorso] = [bytes, { level: 0 }];
  }
  avanza({ fatto: file.length, totale: file.length });

  contenuto['000_indice.pdf'] = [indicePdf(fascicolo, documenti), { level: 0 }];
  const zip = zipSync(contenuto);
  return { zip: new Blob([zip.slice().buffer as ArrayBuffer], { type: 'application/zip' }), nonInclusi };
}
