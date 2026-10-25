// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import type { DatiStampigliatura } from '@/types';

// Colore blu istituzionale
const BLU = rgb(0, 0.2, 0.6); // #003399

// Geometria del riquadro verticale sinistro
const BOX_X = 8;         // distanza dal bordo sinistro della pagina (pt)
const BOX_WIDTH = 30;    // larghezza del riquadro (pt)
const BOX_PAD_INNER = 4; // padding interno orizzontale (sopra/sotto il testo nel box)

/**
 * Aggiunge un timbro verticale sottile sul margine sinistro di ogni pagina.
 * - Riquadro con solo bordo blu, sfondo trasparente
 * - Testo in blu ruotato 90° (legge dal basso verso l'alto)
 * - Si posiziona nel margine sinistro: non tocca il contenuto del documento
 */
export async function stampigliaPdf(
  pdfBytes: ArrayBuffer,
  dati: DatiStampigliatura
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const fontRegolare = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontGrassetto = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pagine = pdfDoc.getPages();

  for (const pagina of pagine) {
    // --- Sistema di riferimento "visivo" ---
    // Molti PDF (soprattutto scansioni) hanno la pagina ruotata tramite /Rotate
    // o un'area visibile (CropBox) che non parte da 0,0. Disegnando nelle
    // coordinate grezze il timbro finirebbe in basso o capovolto una volta
    // visualizzato. Si calcola quindi tutto come se la pagina fosse dritta
    // (u, v = coordinate come le vede il lettore) e poi si converte.
    const rotazione = ((pagina.getRotation().angle % 360) + 360) % 360;
    const area = pagina.getCropBox();
    const ruotataDiLato = rotazione === 90 || rotazione === 270;
    const pageHeight = ruotataDiLato ? area.width : area.height; // altezza visiva

    const aPagina = (u: number, v: number) => {
      switch (rotazione) {
        case 90:  return { x: area.x + area.width - v, y: area.y + u };
        case 180: return { x: area.x + area.width - u, y: area.y + area.height - v };
        case 270: return { x: area.x + v,              y: area.y + area.height - u };
        default:  return { x: area.x + u,              y: area.y + v };
      }
    };
    // Un angolo visivo si traduce nell'angolo di pagina sommando la rotazione
    const angolo = (visivo: number) => degrees((visivo + rotazione) % 360);

    // --- Contenuto testuale ---
    // Solo il numero (la data non viene stampigliata).
    // Protocollo: "Prot. A/0015/2026  (Arrivo)" — PEC: "Prot. P-A/0001/2026  (PEC Arrivo)"
    // — Repertorio: "Rep. C/0001/2026  (Contratto)"
    const flusso = dati.tipo_flusso === 'arrivo' ? 'Arrivo' : 'Partenza';
    const riga1 = dati.registro === 'repertorio'
      ? `Rep. ${dati.numero_protocollo}  (Contratto)`
      : `Prot. ${dati.numero_protocollo}  (${dati.registro === 'pec' ? `PEC ${flusso}` : flusso})`;
    const riga2 = dati.nome_gal;

    const size1 = 7.5;
    const size2 = 7;

    // --- Calcolo dimensioni del testo ---
    // widthOfTextAtSize() restituisce 0 per StandardFonts embedded in pdf-lib,
    // quindi si calcola manualmente: n_caratteri × fontSize × larghezza_media_Helvetica.
    // Helvetica Bold ≈ 0.60 × size per carattere medio
    // Helvetica      ≈ 0.55 × size per carattere medio
    // Larghezze "raw" (senza margine di sicurezza) usate per il centraggio.
    // Larghezze con +20% usate per la dimensione del box.
    const rawW1 = riga1.length * size1 * 0.60;
    const rawW2 = riga2.length * size2 * 0.55;
    const testoMaxW = Math.max(rawW1, rawW2) * 1.20; // +20% di margine per lettere larghe

    // Il box si adatta al testo più lungo + padding verticale (sopra e sotto)
    const boxHeight = testoMaxW + BOX_PAD_INNER * 2;

    // Centra il box verticalmente nella pagina
    const boxY = (pageHeight - boxHeight) / 2;

    // --- Posizioni X delle baseline (orizzontale nella striscia) ---
    // Con rotate(90°): x = posizione orizzontale baseline, y = partenza verticale.
    // Ascendenze vanno a SINISTRA (-x), discendenze a DESTRA (+x).
    const x1 = BOX_X + BOX_PAD_INNER + size1 * 0.72 + BOX_PAD_INNER; // ≈ 13.4
    const x2 = x1 + size1 * 0.22 + 2.5 + size2 * 0.72;               // ≈ 20.0

    // --- Centraggio del testo nell'asse verticale del riquadro ---
    // Il testo parte dal basso (boxY + BOD_PAD_INNER) e sale.
    // Offset di centraggio = metà dello spazio libero tra la larghezza raw e testoMaxW.
    const yStart1 = boxY + BOX_PAD_INNER + (testoMaxW - rawW1) / 2;
    const yStart2 = boxY + BOX_PAD_INNER + (testoMaxW - rawW2) / 2;

    // Le posizioni sopra sono in coordinate visive: vengono convertite qui.
    // drawRectangle/drawText ruotano attorno al punto (x, y) indicato.

    // 1. Riquadro adattato al testo — solo bordo blu, sfondo trasparente
    pagina.drawRectangle({
      ...aPagina(BOX_X, boxY),
      width: BOX_WIDTH,
      height: boxHeight,
      rotate: angolo(0),
      borderColor: BLU,
      borderWidth: 0.8,
    });

    // 2. Riga 1 — grassetto, verticale (si legge dal basso verso l'alto)
    pagina.drawText(riga1, {
      ...aPagina(x1, yStart1),
      size: size1,
      font: fontGrassetto,
      color: BLU,
      rotate: angolo(90),
    });

    // 3. Riga 2 — normale, verticale
    pagina.drawText(riga2, {
      ...aPagina(x2, yStart2),
      size: size2,
      font: fontRegolare,
      color: BLU,
      rotate: angolo(90),
    });
  }

  return pdfDoc.save();
}

/**
 * Genera il nome file per il PDF stampigliato.
 * Formato: PROT_ANNO-NNNN_nomeoriginale.pdf
 */
export function nomeFileStampigliato(
  numeroCompleto: string,
  nomeFileOriginale: string
): string {
  const numero = numeroCompleto.replace(/\//g, '-');
  const baseName = nomeFileOriginale.replace(/\.pdf$/i, '');
  return `PROT_${numero}_${baseName}.pdf`;
}
