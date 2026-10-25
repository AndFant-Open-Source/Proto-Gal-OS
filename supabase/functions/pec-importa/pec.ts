// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
//
// Logica dell'importazione PEC senza dipendenze esterne (provata anche fuori da Supabase):
// lettura del foglio GAL_Indice_PEC, link di Drive, file EML e certificato daticert.xml.

// ── Foglio Google ─────────────────────────────────────────────────────────────

/** Intestazione confrontabile: minuscole, senza accenti, punteggiatura e spazi */
export function normalizzaIntestazione(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Colonne lette dal foglio, cercate per nome (l'ordine delle colonne può cambiare) */
export const COLONNE_INDICE = {
  idAcquisizione: ['ID acquisizione'],
  direzione: ['Direzione proposta', 'Direzione'],
  dataEmail: ['Data email (non certificata)', 'Data email'],
  mittente: ['Mittente'],
  destinatari: ['Destinatari'],
  cc: ['CC'],
  oggetto: ['Oggetto'],
  corpo: ['Corpo testo (anteprima)', 'Corpo testo'],
  messageId: ['Message-ID'],
  numeroAllegati: ['N. allegati'],
  linkEml: ['Link originale EML'],
  linkCartella: ['Link cartella Drive'],
  sha256: ['SHA256 originale'],
  noteVerifica: ['Note verifica'],
  linkPdf: ['Link PDF PEC (senza timbro)'],
} as const;

export const COLONNE_ALLEGATI = {
  idAcquisizione: ['ID acquisizione'],
  posizione: ['Posizione'],
  nome: ['Nome allegato'],
  link: ['Link diretto Google Drive'],
  sha256: ['SHA256 allegato'],
} as const;

export type Riga<C extends Record<string, readonly string[]>> = { [K in keyof C]: string };

/**
 * Trasforma i valori del foglio (prima riga = intestazioni) in oggetti con chiavi fisse.
 * Le colonne mancanti valgono ''. Le righe senza ID acquisizione vengono scartate.
 */
export function leggiFoglio<C extends Record<string, readonly string[]>>(
  valori: unknown[][],
  colonne: C,
): { righe: Riga<C>[]; mancanti: (keyof C)[] } {
  const [intestazione = [], ...dati] = valori;
  const indici = intestazione.map((v) => normalizzaIntestazione(String(v ?? '')));
  const posizione = {} as Record<keyof C, number>;
  const mancanti: (keyof C)[] = [];
  for (const chiave of Object.keys(colonne) as (keyof C)[]) {
    const i = colonne[chiave].map(normalizzaIntestazione).map((n) => indici.indexOf(n)).find((x) => x >= 0) ?? -1;
    posizione[chiave] = i;
    if (i < 0) mancanti.push(chiave);
  }
  const righe = dati
    .map((riga) => {
      const r = {} as Riga<C>;
      for (const chiave of Object.keys(colonne) as (keyof C)[]) {
        const i = posizione[chiave];
        r[chiave] = (i >= 0 ? String(riga[i] ?? '') : '').trim() as Riga<C>[keyof C];
      }
      return r;
    })
    .filter((r) => (r as Record<string, string>).idAcquisizione);
  return { righe, mancanti };
}

/** ID del file da un link di Drive (…/file/d/<id>/view, …?id=<id>, oppure l'ID stesso) */
export function idDaLinkDrive(link: string): string | null {
  const t = link.trim();
  if (!t) return null;
  const m = t.match(/\/d\/([A-Za-z0-9_-]{10,})/) ?? t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}

export function direzioneDa(testo: string): 'arrivo' | 'partenza' | null {
  const t = normalizzaIntestazione(testo);
  if (['entrata', 'arrivo', 'ingresso', 'ricevuta', 'in'].includes(t)) return 'arrivo';
  if (['uscita', 'partenza', 'inviata', 'out'].includes(t)) return 'partenza';
  return null;
}

/** Data ISO del foglio (es. 2026-10-24T00:32:43-07:00); null se non interpretabile */
export function dataDa(testo: string): Date | null {
  const t = testo.trim();
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/** Message-ID confrontabile: senza parentesi angolari, spazi e maiuscole */
export function normalizzaMessageId(id: string | null | undefined): string | null {
  const t = (id ?? '').trim().replace(/^<|>$/g, '').trim().toLowerCase();
  return t || null;
}

// ── File EML (MIME) ───────────────────────────────────────────────────────────

export interface ParteMime {
  intestazioni: Map<string, string>;
  corpo: Uint8Array;
  parti: ParteMime[];
}

const latin1 = new TextDecoder('latin1');

function trova(dati: Uint8Array, cercato: Uint8Array, da: number): number {
  outer: for (let i = da; i <= dati.length - cercato.length; i++) {
    for (let j = 0; j < cercato.length; j++) if (dati[i + j] !== cercato[j]) continue outer;
    return i;
  }
  return -1;
}

function separaIntestazioni(dati: Uint8Array): { intestazioni: Map<string, string>; corpo: Uint8Array } {
  // Fine delle intestazioni: prima riga vuota (CRLF CRLF oppure LF LF)
  let fine = trova(dati, new Uint8Array([13, 10, 13, 10]), 0);
  let salto = 4;
  const lf = trova(dati, new Uint8Array([10, 10]), 0);
  if (fine < 0 || (lf >= 0 && lf < fine)) {
    fine = lf;
    salto = 2;
  }
  if (fine < 0) return { intestazioni: new Map(), corpo: dati };
  const testo = latin1.decode(dati.subarray(0, fine)).replace(/\r?\n[ \t]+/g, ' ');
  const intestazioni = new Map<string, string>();
  for (const riga of testo.split(/\r?\n/)) {
    const i = riga.indexOf(':');
    if (i <= 0) continue;
    const nome = riga.slice(0, i).trim().toLowerCase();
    if (!intestazioni.has(nome)) intestazioni.set(nome, riga.slice(i + 1).trim());
  }
  return { intestazioni, corpo: dati.subarray(fine + salto) };
}

function parametro(valore: string | undefined, nome: string): string | null {
  if (!valore) return null;
  const m = valore.match(new RegExp(`${nome}\\*?=(?:"([^"]*)"|([^;\\s]*))`, 'i'));
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/**
 * Analisi MIME essenziale: intestazioni e parti annidate. Non entra nei messaggi allegati
 * (message/rfc822), che restano un'unica parte.
 */
export function analizzaMime(dati: Uint8Array, profondita = 0): ParteMime {
  const { intestazioni, corpo } = separaIntestazioni(dati);
  const tipo = intestazioni.get('content-type') ?? '';
  const parti: ParteMime[] = [];
  const confine = /^multipart\//i.test(tipo) ? parametro(tipo, 'boundary') : null;
  if (confine && profondita < 8) {
    const separatore = new TextEncoder().encode(`--${confine}`);
    let i = trova(corpo, separatore, 0);
    while (i >= 0) {
      let inizio = i + separatore.length;
      if (corpo[inizio] === 45 && corpo[inizio + 1] === 45) break; // "--" finale
      if (corpo[inizio] === 13) inizio++;
      if (corpo[inizio] === 10) inizio++;
      const prossimo = trova(corpo, separatore, inizio);
      if (prossimo < 0) break;
      let fine = prossimo;
      if (corpo[fine - 1] === 10) fine--;
      if (corpo[fine - 1] === 13) fine--;
      parti.push(analizzaMime(corpo.subarray(inizio, fine), profondita + 1));
      i = prossimo;
    }
  }
  return { intestazioni, corpo, parti };
}

export function nomeFileParte(parte: ParteMime): string | null {
  return parametro(parte.intestazioni.get('content-disposition'), 'filename')
    ?? parametro(parte.intestazioni.get('content-type'), 'name');
}

export function decodificaParte(parte: ParteMime): Uint8Array {
  const codifica = (parte.intestazioni.get('content-transfer-encoding') ?? '').toLowerCase();
  if (codifica === 'base64') {
    const pulito = latin1.decode(parte.corpo).replace(/[^A-Za-z0-9+/=]/g, '');
    const bin = atob(pulito);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  if (codifica === 'quoted-printable') {
    const testo = latin1.decode(parte.corpo).replace(/=\r?\n/g, '');
    const out: number[] = [];
    for (let i = 0; i < testo.length; i++) {
      if (testo[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(testo.slice(i + 1, i + 3))) {
        out.push(parseInt(testo.slice(i + 1, i + 3), 16));
        i += 2;
      } else out.push(testo.charCodeAt(i) & 0xff);
    }
    return new Uint8Array(out);
  }
  return parte.corpo;
}

/** Prima parte (in profondità) che soddisfa la condizione */
export function cercaParte(parte: ParteMime, condizione: (p: ParteMime) => boolean): ParteMime | null {
  if (condizione(parte)) return parte;
  for (const p of parte.parti) {
    const trovata = cercaParte(p, condizione);
    if (trovata) return trovata;
  }
  return null;
}

// ── Certificato PEC (daticert.xml) ────────────────────────────────────────────

export interface DatiCertificato {
  /** posta-certificata, accettazione, avvenuta-consegna, errore-consegna, … */
  tipo: string | null;
  data: Date | null;
  msgid: string | null;
  gestore: string | null;
}

const entita = (t: string) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function leggiDaticert(xml: string): DatiCertificato {
  const tipo = xml.match(/<postacert\b[^>]*\btipo="([^"]+)"/i)?.[1] ?? null;
  const m = xml.match(/<data\b[^>]*zona="([+-])(\d{2})(\d{2})"[^>]*>\s*<giorno>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/giorno>\s*<ora>\s*(\d{2}):(\d{2}):(\d{2})\s*<\/ora>/i);
  let data: Date | null = null;
  if (m) {
    const [, segno, hh, mm, g, me, a, h, mi, s] = m;
    data = new Date(`${a}-${me}-${g}T${h}:${mi}:${s}${segno}${hh}:${mm}`);
    if (isNaN(data.getTime())) data = null;
  }
  const msgid = xml.match(/<msgid>\s*([\s\S]*?)\s*<\/msgid>/i)?.[1];
  const gestore = xml.match(/<gestore-emittente>\s*([\s\S]*?)\s*<\/gestore-emittente>/i)?.[1];
  return {
    tipo: tipo ? tipo.toLowerCase() : null,
    data,
    msgid: msgid ? normalizzaMessageId(entita(msgid)) : null,
    gestore: gestore ? entita(gestore).trim() : null,
  };
}

export interface DatiEml {
  messageId: string | null;
  data: Date | null;
  /** Valore di X-Ricevuta (accettazione, avvenuta-consegna, …) se è una ricevuta */
  ricevuta: string | null;
  /** Valore di X-Trasporto (posta-certificata, errore) se è una busta di trasporto */
  trasporto: string | null;
  riferimentoMessageId: string | null;
  certificato: DatiCertificato | null;
}

export function leggiEml(dati: Uint8Array): DatiEml {
  const radice = analizzaMime(dati);
  const h = radice.intestazioni;
  const parteCert = cercaParte(radice, (p) => (nomeFileParte(p) ?? '').toLowerCase() === 'daticert.xml');
  const certificato = parteCert ? leggiDaticert(new TextDecoder('utf-8').decode(decodificaParte(parteCert))) : null;
  const data = h.get('date') ? new Date(h.get('date') as string) : null;
  const ricevuta = h.get('x-ricevuta')?.toLowerCase() ?? null;
  return {
    messageId: normalizzaMessageId(h.get('message-id')),
    data: data && !isNaN(data.getTime()) ? data : null,
    ricevuta,
    trasporto: h.get('x-trasporto')?.toLowerCase() ?? null,
    riferimentoMessageId: normalizzaMessageId(h.get('x-riferimento-message-id'))
      ?? (ricevuta ? certificato?.msgid ?? null : null),
    certificato,
  };
}

// ── Testo e nomi ──────────────────────────────────────────────────────────────

/** Nome utilizzabile come chiave dell'archivio (niente accenti, spazi e simboli) */
export function nomeFileSicuro(nome: string): string {
  const pulito = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]/g, '_');
  return pulito.slice(-150) || 'file';
}

/** Testo pulito per il database: niente caratteri nulli, lunghezza massima */
export function testoPulito(testo: string, massimo = 5000): string | null {
  const t = testo.replace(/\u0000/g, '').trim();
  return t ? t.slice(0, massimo) : null;
}

/** Caratteri sostituiti per una decodifica sbagliata nel programma che legge le PEC */
export function haProblemiDiDecodifica(...testi: string[]): boolean {
  return testi.some((t) => t.includes('�'));
}

/** Testo stampabile con i font standard del PDF (WinAnsi): il resto diventa "?" */
export function testoWinAnsi(testo: string): string {
  return testo
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/€/g, 'EUR')
    .replace(/[  -​ ]/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/[^\x20-\x7E¡-ÿ\n]/gu, '?');
}

export async function sha256Hex(dati: Uint8Array): Promise<string> {
  const impronta = new Uint8Array(await crypto.subtle.digest('SHA-256', dati as BufferSource));
  return Array.from(impronta, (b) => b.toString(16).padStart(2, '0')).join('');
}
