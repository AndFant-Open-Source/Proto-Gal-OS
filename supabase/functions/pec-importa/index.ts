// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
//
// Supabase Edge Function "pec-importa": importa nella coda "Da protocollare" le PEC elencate
// nel foglio Google GAL_Indice_PEC, copiando da Google Drive EML, PDF e allegati nell'archivio
// privato del protocollo (cartella pec/<ID acquisizione>/).
//
// - Accesso a Google con un account di servizio in SOLA LETTURA; chiavi nei segreti di Supabase:
//     GOOGLE_SERVICE_ACCOUNT_JSON  file JSON della chiave dell'account di servizio
//     PEC_SPREADSHEET_ID           ID del foglio GAL_Indice_PEC (dal suo indirizzo)
// - Solo operatori e amministratori attivi possono avviarla.
// - Importa a blocchi: ogni chiamata lavora al massimo ~90 secondi e restituisce quante righe
//   restano; l'app la richiama finché non ha finito. Le righe già importate si saltano.
// - Non assegna numeri di protocollo, non scrive sul foglio, non cancella nulla su Drive.
// - Nel registro delle importazioni non finiscono testi delle PEC né chiavi.

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import type { PDFFont, PDFPage } from 'npm:pdf-lib@1.17.1';
import {
  COLONNE_ALLEGATI, COLONNE_INDICE, dataDa, direzioneDa, haProblemiDiDecodifica, idDaLinkDrive, leggiEml,
  leggiFoglio, nomeFileSicuro, normalizzaMessageId, sha256Hex, testoPulito, testoWinAnsi,
} from './pec.ts';
import type { Riga } from './pec.ts';

const BUCKET = 'allegati-protocollo';
const DIMENSIONE_MASSIMA = 50 * 1024 * 1024;
const TEMPO_MASSIMO_MS = 90_000;
const RIGHE_PER_CHIAMATA = 25;

// Formati ammessi dall'archivio (supabase/schema.sql, sezione 1); gli altri si salvano come generici
const FORMATI_ARCHIVIO = new Set([
  'application/pdf', 'application/pkcs7-mime', 'application/x-pkcs7-mime', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/tiff',
  'message/rfc822', 'application/vnd.ms-outlook', 'application/xml', 'text/xml', 'text/plain', 'text/csv',
  'application/rtf', 'application/zip', 'application/x-zip-compressed', 'application/pkcs7-signature',
  'application/x-pkcs7-signature', 'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet', 'image/gif',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // x-application-name: intestazione aggiunta dal client Supabase dell'app (src/lib/supabase.ts)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Errore con un codice che l'app traduce in un messaggio comprensibile */
class ErroreImportazione extends Error {
  readonly codice: string;
  readonly stato: number;
  constructor(codice: string, messaggio: string, stato = 500) {
    super(messaggio);
    this.codice = codice;
    this.stato = stato;
  }
}

const risposta = (corpo: unknown, stato = 200) =>
  new Response(JSON.stringify(corpo), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Google: accesso con account di servizio (JWT firmato) ─────────────────────

interface AccountServizio {
  client_email: string;
  private_key: string;
}

function base64url(dati: Uint8Array): string {
  let bin = '';
  for (const b of dati) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenGoogle(account: AccountServizio): Promise<string> {
  const ora = Math.floor(Date.now() / 1000);
  const codifica = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  const dati = `${codifica({ alg: 'RS256', typ: 'JWT' })}.${codifica({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ora,
    exp: ora + 3600,
  })}`;
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const chiave = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chiave, new TextEncoder().encode(dati)));
  const esito = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${dati}.${base64url(firma)}`,
    }),
  });
  if (!esito.ok) throw new ErroreImportazione('google_non_autorizzato', `Accesso a Google rifiutato (${esito.status})`);
  return (await esito.json()).access_token as string;
}

/** Richiesta a Google con nuovi tentativi per limiti di frequenza ed errori temporanei */
async function chiamaGoogle(url: string, token: string): Promise<Response> {
  for (let tentativo = 0; ; tentativo++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if ((r.status === 429 || r.status >= 500) && tentativo < 3) {
      await r.body?.cancel();
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** tentativo));
      continue;
    }
    return r;
  }
}

async function leggiScheda(idFoglio: string, scheda: string, token: string): Promise<unknown[][]> {
  const r = await chiamaGoogle(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(idFoglio)}/values/${encodeURIComponent(scheda)}?valueRenderOption=FORMATTED_VALUE`,
    token,
  );
  if (r.status === 404 || r.status === 403) {
    await r.body?.cancel();
    throw new ErroreImportazione('foglio_non_trovato', `Foglio o scheda "${scheda}" non accessibile (${r.status})`);
  }
  if (!r.ok) throw new ErroreImportazione('google_errore', `Errore nella lettura del foglio (${r.status})`);
  return ((await r.json()).values ?? []) as unknown[][];
}

interface FileDrive {
  nome: string;
  tipo: string;
  dati: Uint8Array;
}

type EsitoDrive = { ok: true; file: FileDrive } | { ok: false; motivo: string };

async function scaricaDaDrive(idFile: string, token: string): Promise<EsitoDrive> {
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(idFile)}`;
  const meta = await chiamaGoogle(`${base}?fields=name,size,mimeType&supportsAllDrives=true`, token);
  if (!meta.ok) {
    await meta.body?.cancel();
    return { ok: false, motivo: meta.status === 404 || meta.status === 403 ? 'non_accessibile' : 'errore_drive' };
  }
  const info = await meta.json() as { name: string; size?: string; mimeType?: string };
  if (Number(info.size ?? 0) > DIMENSIONE_MASSIMA) return { ok: false, motivo: 'troppo_grande' };
  const r = await chiamaGoogle(`${base}?alt=media&supportsAllDrives=true`, token);
  if (!r.ok) {
    await r.body?.cancel();
    return { ok: false, motivo: 'errore_drive' };
  }
  return { ok: true, file: { nome: info.name, tipo: info.mimeType ?? 'application/octet-stream', dati: new Uint8Array(await r.arrayBuffer()) } };
}

// ── PDF di consultazione quando il programma non l'ha creato (indice V3) ──────

function aCapo(testo: string, font: PDFFont, dimensione: number, larghezza: number): string[] {
  const righe: string[] = [];
  for (const paragrafo of testo.split('\n')) {
    let riga = '';
    for (const parola of paragrafo.split(/ +/)) {
      const prova = riga ? `${riga} ${parola}` : parola;
      if (font.widthOfTextAtSize(prova, dimensione) <= larghezza) riga = prova;
      else {
        if (riga) righe.push(riga);
        // Parola più lunga della riga (es. un link): spezzata
        let resto = parola;
        while (font.widthOfTextAtSize(resto, dimensione) > larghezza && resto.length > 1) {
          let n = resto.length;
          while (n > 1 && font.widthOfTextAtSize(resto.slice(0, n), dimensione) > larghezza) n--;
          righe.push(resto.slice(0, n));
          resto = resto.slice(n);
        }
        riga = resto;
      }
    }
    righe.push(riga);
  }
  return righe;
}

async function creaSchedaPdf(r: Riga<typeof COLONNE_INDICE>, allegati: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normale = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const sinistra = 56; // il timbro del protocollo occupa il margine sinistro
  const larghezza = 595 - sinistra - 48;
  let pagina: PDFPage = doc.addPage([595, 842]);
  let y = 790;
  const scrivi = (testo: string, font: PDFFont, dimensione: number, colore = rgb(0.1, 0.1, 0.18)) => {
    for (const riga of aCapo(testoWinAnsi(testo), font, dimensione, larghezza)) {
      if (y < 60) {
        pagina = doc.addPage([595, 842]);
        y = 790;
      }
      pagina.drawText(riga, { x: sinistra, y, size: dimensione, font, color: colore });
      y -= dimensione * 1.45;
    }
  };
  scrivi('Messaggio di posta elettronica', grassetto, 15);
  y -= 6;
  for (const [etichetta, valore] of [
    ['Da', r.mittente], ['A', r.destinatari], ['Cc', r.cc], ['Data intestazione', r.dataEmail],
    ['Oggetto', r.oggetto], ['Message-ID', r.messageId],
  ]) {
    if (valore) scrivi(`${etichetta}: ${valore}`, etichetta === 'Oggetto' ? grassetto : normale, 10);
  }
  y -= 8;
  scrivi(r.corpo || '(testo non disponibile nell\'indice)', normale, 10);
  y -= 8;
  scrivi('Allegati al messaggio', grassetto, 11);
  scrivi(allegati.length ? allegati.map((a) => `- ${a}`).join('\n') : 'Nessuno', normale, 10);
  y -= 8;
  scrivi(`ID acquisizione: ${r.idAcquisizione}`, normale, 9, rgb(0.4, 0.4, 0.45));
  scrivi('Scheda creata dal protocollo perché il PDF della PEC non era disponibile. Testo tratto dall\'indice, '
    + 'che può essere un\'anteprima: fa fede il file EML originale allegato.', normale, 8, rgb(0.4, 0.4, 0.45));
  return doc.save();
}

// ── Importazione di una riga ──────────────────────────────────────────────────

interface Contesto {
  db: SupabaseClient;
  token: string;
  importazioneId: string;
  allegatiPerId: Map<string, Riga<typeof COLONNE_ALLEGATI>[]>;
}

interface FileSalvato {
  ruolo: 'eml' | 'pdf' | 'allegato';
  posizione: number;
  nome_file: string;
  storage_path: string;
  dimensione_bytes: number;
  tipo_mime: string;
  sha256: string;
  generato: boolean;
}

const MOTIVO: Record<string, string> = {
  non_accessibile: 'file_non_accessibile',
  troppo_grande: 'file_troppo_grande',
  errore_drive: 'file_non_scaricato',
};

async function salva(db: SupabaseClient, percorso: string, dati: Uint8Array, tipo: string): Promise<void> {
  const tipoArchivio = FORMATI_ARCHIVIO.has(tipo) ? tipo : 'application/octet-stream';
  // upsert: una PEC tolta dalla coda da un amministratore si può reimportare
  const { error } = await db.storage.from(BUCKET).upload(percorso, new Blob([dati.slice().buffer as ArrayBuffer], { type: tipoArchivio }), {
    contentType: tipoArchivio,
    upsert: true,
  });
  if (error) throw new ErroreImportazione('archivio_errore', `Salvataggio nell'archivio non riuscito`);
}

async function importaRiga(r: Riga<typeof COLONNE_INDICE>, c: Contesto): Promise<'nuova' | 'anomalia'> {
  const anomalie: string[] = [];
  const avvisi: string[] = [];
  const cartella = `pec/${nomeFileSicuro(r.idAcquisizione)}`;
  const file: FileSalvato[] = [];

  // EML originale
  let datiEml: ReturnType<typeof leggiEml> | null = null;
  let shaEml: string | null = null;
  const idEml = idDaLinkDrive(r.linkEml);
  if (!idEml) anomalie.push('eml_mancante');
  else {
    const esito = await scaricaDaDrive(idEml, c.token);
    if (!esito.ok) anomalie.push(`${MOTIVO[esito.motivo]}:EML`);
    else {
      shaEml = await sha256Hex(esito.file.dati);
      if (r.sha256 && r.sha256.toLowerCase() !== shaEml) anomalie.push('sha256_diverso:EML');
      try {
        datiEml = leggiEml(esito.file.dati);
      } catch {
        avvisi.push('eml_non_leggibile');
      }
      const nome = esito.file.nome.toLowerCase().endsWith('.eml') ? esito.file.nome : `${r.idAcquisizione}.eml`;
      const percorso = `${cartella}/eml/${nomeFileSicuro(nome)}`;
      await salva(c.db, percorso, esito.file.dati, 'message/rfc822');
      file.push({ ruolo: 'eml', posizione: 0, nome_file: nome, storage_path: percorso, dimensione_bytes: esito.file.dati.length,
        tipo_mime: 'message/rfc822', sha256: shaEml, generato: false });
    }
  }

  // Allegati, nell'ordine del foglio Allegati
  const elencoAllegati = (c.allegatiPerId.get(r.idAcquisizione) ?? [])
    .slice()
    .sort((a, b) => Number(a.posizione || 0) - Number(b.posizione || 0));
  for (const [i, a] of elencoAllegati.entries()) {
    const posizione = Math.round(Number(a.posizione)) || i + 1;
    const idFile = idDaLinkDrive(a.link);
    if (!idFile) {
      anomalie.push(`allegato_mancante:${a.nome || posizione}`);
      continue;
    }
    const esito = await scaricaDaDrive(idFile, c.token);
    if (!esito.ok) {
      anomalie.push(`${MOTIVO[esito.motivo]}:${a.nome || posizione}`);
      continue;
    }
    const sha = await sha256Hex(esito.file.dati);
    if (a.sha256 && a.sha256.toLowerCase() !== sha) anomalie.push(`sha256_diverso:${a.nome || posizione}`);
    const nome = a.nome || esito.file.nome;
    const percorso = `${cartella}/allegati/${String(posizione).padStart(3, '0')}-${nomeFileSicuro(nome)}`;
    await salva(c.db, percorso, esito.file.dati, esito.file.tipo);
    file.push({ ruolo: 'allegato', posizione, nome_file: nome, storage_path: percorso, dimensione_bytes: esito.file.dati.length,
      tipo_mime: FORMATI_ARCHIVIO.has(esito.file.tipo) ? esito.file.tipo : 'application/octet-stream', sha256: sha, generato: false });
  }
  const attesi = Number(r.numeroAllegati);
  if (r.numeroAllegati !== '' && !isNaN(attesi) && attesi !== elencoAllegati.length) avvisi.push('numero_allegati_diverso');

  // PDF di consultazione: quello del programma (V4) oppure una scheda creata qui
  const idPdf = idDaLinkDrive(r.linkPdf);
  let pdfSalvato = false;
  if (idPdf) {
    const esito = await scaricaDaDrive(idPdf, c.token);
    if (esito.ok) {
      const percorso = `${cartella}/pdf/${nomeFileSicuro(esito.file.nome || 'pec_visualizzazione.pdf')}`;
      await salva(c.db, percorso, esito.file.dati, 'application/pdf');
      file.push({ ruolo: 'pdf', posizione: 0, nome_file: esito.file.nome || 'pec_visualizzazione.pdf', storage_path: percorso,
        dimensione_bytes: esito.file.dati.length, tipo_mime: 'application/pdf', sha256: await sha256Hex(esito.file.dati), generato: false });
      pdfSalvato = true;
    } else avvisi.push(`pdf_non_scaricato:${esito.motivo}`);
  }
  if (!pdfSalvato) {
    const scheda = await creaSchedaPdf(r, elencoAllegati.map((a) => a.nome));
    const percorso = `${cartella}/pdf/scheda_pec.pdf`;
    await salva(c.db, percorso, scheda, 'application/pdf');
    file.push({ ruolo: 'pdf', posizione: 0, nome_file: 'scheda_pec.pdf', storage_path: percorso, dimensione_bytes: scheda.length,
      tipo_mime: 'application/pdf', sha256: await sha256Hex(scheda), generato: true });
    avvisi.push('pdf_creato_dal_protocollo');
  }

  // Dati del messaggio: il certificato prevale sul foglio
  const certificato = datiEml?.certificato ?? null;
  const ricevuta = datiEml?.ricevuta ?? (certificato?.tipo && certificato.tipo !== 'posta-certificata' ? certificato.tipo : null);
  const dataEmail = dataDa(r.dataEmail) ?? datiEml?.data ?? null;
  if (!dataEmail && !certificato?.data) anomalie.push('data_mancante');
  if (!certificato?.data) avvisi.push('data_non_certificata');
  const direzione = direzioneDa(r.direzione);
  if (!direzione && !ricevuta) avvisi.push('direzione_da_indicare');
  if (haProblemiDiDecodifica(r.oggetto, r.corpo, r.mittente)) avvisi.push('caratteri_non_decodificati');
  const messageId = normalizzaMessageId(r.messageId) ?? datiEml?.messageId ?? null;

  // Duplicati: stesso EML o stesso Message-ID già in coda con un altro ID acquisizione
  const condizioni = [shaEml && `sha256_eml.eq.${shaEml}`, messageId && `message_id.eq."${messageId.replace(/"/g, '')}"`].filter(Boolean);
  if (condizioni.length) {
    const { data: doppi, error } = await c.db.from('protocollo_pec_messaggi').select('id_acquisizione').or(condizioni.join(',')).limit(3);
    if (error) throw new ErroreImportazione('database_errore', 'Controllo dei duplicati non riuscito');
    for (const d of doppi ?? []) anomalie.push(`duplicato:${d.id_acquisizione}`);
  }

  const { data: messaggio, error } = await c.db.from('protocollo_pec_messaggi').insert({
    id_acquisizione: r.idAcquisizione,
    tipo: ricevuta ? 'ricevuta' : 'messaggio',
    direzione,
    direzione_proposta: testoPulito(r.direzione, 50),
    mittente: testoPulito(r.mittente, 1000),
    destinatari: testoPulito(r.destinatari, 4000),
    cc: testoPulito(r.cc, 4000),
    oggetto: testoPulito(r.oggetto, 1000),
    corpo_anteprima: testoPulito(r.corpo, 5000),
    message_id: messageId,
    sha256_eml: shaEml,
    data_email: dataEmail?.toISOString() ?? null,
    data_certificata: certificato?.data?.toISOString() ?? null,
    tipo_certificazione: ricevuta ?? certificato?.tipo ?? datiEml?.trasporto ?? null,
    riferimento_message_id: datiEml?.riferimentoMessageId ?? null,
    stato: anomalie.length ? 'anomalia' : 'da_verificare',
    anomalie,
    avvisi,
    note_verifica: testoPulito(r.noteVerifica, 2000),
    drive_cartella: testoPulito(r.linkCartella, 500),
    numero_allegati_indice: r.numeroAllegati !== '' && !isNaN(attesi) ? attesi : null,
    importazione_id: c.importazioneId,
  }).select('id').single();
  if (error) {
    // Un'altra importazione l'ha appena inserita: nessun problema
    if (error.code === '23505') return 'nuova';
    throw new ErroreImportazione('database_errore', 'Inserimento in coda non riuscito');
  }
  if (file.length) {
    const { error: erroreFile } = await c.db.from('protocollo_pec_file')
      .upsert(file.map((f) => ({ ...f, messaggio_id: messaggio.id })), { onConflict: 'storage_path' });
    if (erroreFile) throw new ErroreImportazione('database_errore', 'Registrazione dei file non riuscita');
  }
  return anomalie.length ? 'anomalia' : 'nuova';
}

// ── Richiesta ─────────────────────────────────────────────────────────────────

async function utenteOperatore(db: SupabaseClient, req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ErroreImportazione('non_autenticato', 'Accesso richiesto', 401);
  const { data: profilo } = await db.from('protocollo_profili').select('ruolo, attivo').eq('id', data.user.id).maybeSingle();
  if (!profilo?.attivo || !['admin', 'operatore'].includes(profilo.ruolo)) {
    throw new ErroreImportazione('non_autorizzato', 'Importazione riservata a operatori e amministratori', 403);
  }
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return risposta({ errore: 'metodo_non_ammesso' }, 405);

  const inizio = Date.now();
  const chiaveServizio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', chiaveServizio, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let importazioneId: string | null = null;

  try {
    const utente = await utenteOperatore(db, req);
    const corpo = await req.json().catch(() => ({})) as { importazione_id?: string };

    const json = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const idFoglio = Deno.env.get('PEC_SPREADSHEET_ID');
    if (!json || !idFoglio) {
      throw new ErroreImportazione('configurazione_mancante', 'Segreti GOOGLE_SERVICE_ACCOUNT_JSON o PEC_SPREADSHEET_ID non impostati', 503);
    }
    let account: AccountServizio;
    try {
      account = JSON.parse(json);
    } catch {
      throw new ErroreImportazione('configurazione_mancante', 'GOOGLE_SERVICE_ACCOUNT_JSON non è un JSON valido', 503);
    }

    // Una sola importazione alla volta: si riprende quella in corso
    if (corpo.importazione_id) importazioneId = corpo.importazione_id;
    else {
      const { data: inCorso } = await db.from('protocollo_pec_importazioni').select('id')
        .eq('stato', 'in_corso').gt('avviata_il', new Date(Date.now() - 30 * 60_000).toISOString()).limit(1);
      if (inCorso?.length) throw new ErroreImportazione('importazione_in_corso', 'Un\'altra importazione è in corso', 409);
      const { data, error } = await db.from('protocollo_pec_importazioni').insert({ avviata_da: utente }).select('id').single();
      if (error) throw new ErroreImportazione('database_errore', 'Avvio dell\'importazione non riuscito');
      importazioneId = data.id;
    }

    const token = await tokenGoogle(account);
    const [valoriIndice, valoriAllegati] = await Promise.all([
      leggiScheda(idFoglio, 'Indice', token),
      leggiScheda(idFoglio, 'Allegati', token),
    ]);
    const indice = leggiFoglio(valoriIndice, COLONNE_INDICE);
    if (indice.mancanti.includes('idAcquisizione') || indice.mancanti.includes('linkEml')) {
      throw new ErroreImportazione('foglio_non_valido', 'Nel foglio Indice mancano le colonne "ID acquisizione" o "Link originale EML"');
    }
    const allegati = leggiFoglio(valoriAllegati, COLONNE_ALLEGATI);
    const allegatiPerId = new Map<string, Riga<typeof COLONNE_ALLEGATI>[]>();
    for (const a of allegati.righe) allegatiPerId.set(a.idAcquisizione, [...(allegatiPerId.get(a.idAcquisizione) ?? []), a]);

    // Righe già importate (a blocchi: il server restituisce al massimo 1000 righe)
    const presenti = new Set<string>();
    for (let da = 0; ; da += 1000) {
      const { data, error } = await db.from('protocollo_pec_messaggi').select('id_acquisizione').order('id').range(da, da + 999);
      if (error) throw new ErroreImportazione('database_errore', 'Lettura della coda non riuscita');
      for (const m of data) presenti.add(m.id_acquisizione);
      if (data.length < 1000) break;
    }
    // Nuove righe in ordine di data (le più vecchie prima), righe senza data in fondo
    const daImportare = indice.righe
      .filter((r) => !presenti.has(r.idAcquisizione))
      .sort((a, b) => (dataDa(a.dataEmail)?.getTime() ?? Infinity) - (dataDa(b.dataEmail)?.getTime() ?? Infinity));

    const contesto: Contesto = { db, token, importazioneId: importazioneId as string, allegatiPerId };
    let nuove = 0;
    let anomalie = 0;
    let fatte = 0;
    for (const riga of daImportare) {
      if (fatte >= RIGHE_PER_CHIAMATA || Date.now() - inizio > TEMPO_MASSIMO_MS) break;
      const esito = await importaRiga(riga, contesto);
      fatte++;
      if (esito === 'anomalia') anomalie++;
      else nuove++;
    }
    await db.rpc('protocollo_pec_collega_ricevute');

    const rimanenti = daImportare.length - fatte;
    const { data: attuale } = await db.from('protocollo_pec_importazioni').select('nuove, anomalie').eq('id', importazioneId).single();
    await db.from('protocollo_pec_importazioni').update({
      righe_indice: indice.righe.length,
      nuove: (attuale?.nuove ?? 0) + nuove,
      anomalie: (attuale?.anomalie ?? 0) + anomalie,
      gia_presenti: indice.righe.length - daImportare.length,
      ...(rimanenti === 0 ? { stato: 'completata', conclusa_il: new Date().toISOString() } : {}),
    }).eq('id', importazioneId);

    return risposta({
      importazione_id: importazioneId,
      righe_indice: indice.righe.length,
      importate_ora: fatte,
      nuove,
      anomalie,
      rimanenti,
      completata: rimanenti === 0,
      colonne_mancanti: indice.mancanti,
    });
  } catch (err) {
    const e = err instanceof ErroreImportazione ? err : new ErroreImportazione('errore_imprevisto', 'Errore imprevisto');
    console.error('pec-importa:', e.codice, e.message);
    if (importazioneId && e.codice !== 'importazione_in_corso') {
      await db.from('protocollo_pec_importazioni').update({
        stato: 'interrotta', conclusa_il: new Date().toISOString(), errore: `${e.codice}: ${e.message}`,
      }).eq('id', importazioneId);
    }
    return risposta({ errore: e.codice, importazione_id: importazioneId }, e.stato);
  }
});
