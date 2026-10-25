// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { strFromU8, unzipSync } from 'fflate';
import { supabase } from '@/lib/supabase';
import { leggiTutto } from '@/hooks/useProtocolli';

/**
 * Importazione di un backup ZIP creato dalla pagina "Backup dati" di Proto Gal (multi-GAL).
 * Contenuto: backup.json (righe delle tabelle, utenti citati, contatori) e la cartella file/
 * con gli allegati al loro percorso di archivio. Lo stesso formato è scritto da
 * src/lib/backup.ts di Proto Gal: cambiarli insieme.
 * Le righe passano dalla funzione protocollo_importa_backup (supabase/schema.sql, solo admin),
 * che conserva numeri, date e autori originali e salta le righe già presenti.
 */
export const FORMATO_BACKUP = 'protogal-backup';
export const VERSIONE_BACKUP = 1;

const BUCKET = 'allegati-protocollo';
const BLOCCO = 300;

export type Riga = Record<string, unknown>;

export interface UtenteBackup {
  id: string;
  nome_completo: string;
  ruolo: string;
}

export interface Backup {
  formato: typeof FORMATO_BACKUP;
  versione: typeof VERSIONE_BACKUP;
  creato_il: string;
  ente: { nome: string; codice: string };
  utenti: UtenteBackup[];
  protocolli: Riga[];
  allegati_protocolli: Riga[];
  contratti: Riga[];
  allegati_contratti: Riga[];
  storico: Riga[];
  contatori_protocolli: { anno: number; tipo_flusso: string; ultimo_numero: number }[];
  contatori_contratti: { anno: number; ultimo_numero: number }[];
  file_mancanti: string[];
}

export interface BackupLetto {
  backup: Backup;
  file: Record<string, Uint8Array>;
}

/** Errore con un messaggio già comprensibile per l'utente */
export class ErroreBackup extends Error {}

export interface Avanzamento {
  fase: string;
  fatto: number;
  totale: number;
}

export interface EsitoImportazione {
  righe: Record<string, number>;
  fileCopiati: number;
  fileGiaPresenti: number;
  fileNonCopiati: string[];
}

/** vecchio id utente → id della persona nel nuovo progetto ('' = nessuno) */
export type MappaUtenti = Record<string, string>;

const CAMPI_UTENTE = ['operatore_id', 'bloccato_da', 'caricato_da', 'utente_id'];

const testo = (v: unknown): string => (typeof v === 'string' ? v : '');

export async function leggiBackup(file: File): Promise<BackupLetto> {
  let contenuto: Record<string, Uint8Array>;
  try {
    contenuto = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ErroreBackup('Il file non è un archivio ZIP valido.');
  }
  const json = contenuto['backup.json'];
  if (!json) throw new ErroreBackup('Il file ZIP non contiene un backup di ProtoGal (manca backup.json).');

  let backup: Backup;
  try {
    backup = JSON.parse(strFromU8(json)) as Backup;
  } catch {
    throw new ErroreBackup('Il backup è danneggiato e non può essere letto.');
  }
  if (backup.formato !== FORMATO_BACKUP || backup.versione !== VERSIONE_BACKUP) {
    throw new ErroreBackup('Il file non è un backup di ProtoGal o proviene da una versione non supportata.');
  }
  for (const chiave of ['utenti', 'protocolli', 'allegati_protocolli', 'contratti', 'allegati_contratti', 'storico'] as const) {
    if (!Array.isArray(backup[chiave])) throw new ErroreBackup('Il backup è incompleto.');
  }
  return { backup, file: contenuto };
}

const normalizza = (nome: string) => nome.trim().toLowerCase().replace(/\s+/g, ' ');

/** Proposta iniziale: stessa persona se il nome completo coincide */
export function proponiMappa(utenti: UtenteBackup[], persone: { id: string; nome_completo: string }[]): MappaUtenti {
  const mappa: MappaUtenti = {};
  for (const u of utenti) {
    const trovata = persone.find((p) => normalizza(p.nome_completo) === normalizza(u.nome_completo));
    mappa[u.id] = trovata?.id ?? '';
  }
  return mappa;
}

/** Numeri del backup già usati nel nuovo progetto da un protocollo o contratto diverso */
export async function trovaConflitti(backup: Backup): Promise<string[]> {
  const [protocolli, contratti] = await Promise.all([
    leggiTutto<{ id: string; anno: number; tipo_flusso: string; numero: number; numero_completo: string }>((da, a) =>
      // I backup di Proto Gal contengono solo la serie ordinaria: la serie PEC non entra in conflitto
      supabase.from('protocollo_registro').select('id, anno, tipo_flusso, numero, numero_completo')
        .eq('registro', 'ordinario').order('id').range(da, a)),
    leggiTutto<{ id: string; anno: number; numero: number; numero_completo: string }>((da, a) =>
      supabase.from('protocollo_contratti').select('id, anno, numero, numero_completo').order('id').range(da, a)),
  ]);
  const occupati = new Map(protocolli.map((p) => [`${p.anno}|${p.tipo_flusso}|${p.numero}`, p]));
  const occupatiC = new Map(contratti.map((c) => [`${c.anno}|${c.numero}`, c]));
  const conflitti: string[] = [];
  for (const p of backup.protocolli) {
    const esistente = occupati.get(`${String(p.anno)}|${testo(p.tipo_flusso)}|${String(p.numero)}`);
    if (esistente && esistente.id !== p.id) conflitti.push(esistente.numero_completo);
  }
  for (const c of backup.contratti) {
    const esistente = occupatiC.get(`${String(c.anno)}|${String(c.numero)}`);
    if (esistente && esistente.id !== c.id) conflitti.push(esistente.numero_completo);
  }
  return conflitti;
}

function traduciUtenti(righe: Riga[], mappa: MappaUtenti): Riga[] {
  return righe.map((r) => {
    const riga: Riga = { ...r };
    for (const campo of CAMPI_UTENTE) {
      if (campo in riga) riga[campo] = mappa[testo(riga[campo])] || null;
    }
    return riga;
  });
}

export async function importaBackup(
  { backup, file }: BackupLetto,
  mappa: MappaUtenti,
  avanza: (a: Avanzamento) => void,
): Promise<EsitoImportazione> {
  // Ordine obbligato: prima protocolli e contratti, poi ciò che vi fa riferimento
  const tabelle: [string, string, Riga[]][] = [
    ['protocolli', 'Protocolli', backup.protocolli],
    ['allegati_protocolli', 'Allegati dei protocolli', backup.allegati_protocolli],
    ['contratti', 'Contratti', backup.contratti],
    ['allegati_contratti', 'Allegati dei contratti', backup.allegati_contratti],
    ['storico', 'Storico delle azioni', backup.storico],
  ];
  const righe: Record<string, number> = {};
  for (const [tabella, etichetta, elenco] of tabelle) {
    const tradotte = traduciUtenti(elenco, mappa);
    righe[tabella] = 0;
    for (let i = 0; i < tradotte.length; i += BLOCCO) {
      avanza({ fase: etichetta, fatto: i, totale: tradotte.length });
      const { data, error } = await supabase.rpc('protocollo_importa_backup', {
        p_tabella: tabella,
        p_righe: tradotte.slice(i, i + BLOCCO),
      });
      if (error) throw error;
      righe[tabella] += Number(data ?? 0);
    }
  }

  avanza({ fase: 'Contatori della numerazione', fatto: 0, totale: 0 });
  const { error: erroreContatori } = await supabase.rpc('protocollo_importa_backup', {
    p_tabella: 'contatori',
    p_righe: { protocolli: backup.contatori_protocolli, contratti: backup.contatori_contratti },
  });
  if (erroreContatori) throw erroreContatori;

  const allegati = [...backup.allegati_protocolli, ...backup.allegati_contratti];
  const esito: EsitoImportazione = { righe, fileCopiati: 0, fileGiaPresenti: 0, fileNonCopiati: [] };
  for (let i = 0; i < allegati.length; i++) {
    avanza({ fase: 'Caricamento degli allegati', fatto: i, totale: allegati.length });
    const percorso = testo(allegati[i].storage_path);
    const dati = file[`file/${percorso}`];
    if (!percorso || !dati) {
      if (percorso) esito.fileNonCopiati.push(`${percorso} (assente nel backup)`);
      continue;
    }
    const tipo = testo(allegati[i].tipo_mime) || undefined;
    const { error } = await supabase.storage.from(BUCKET).upload(
      percorso,
      new Blob([dati.slice().buffer as ArrayBuffer], { type: tipo }),
      { contentType: tipo, upsert: false },
    );
    if (!error) esito.fileCopiati++;
    else if (/exists|duplicate/i.test(error.message)) esito.fileGiaPresenti++;
    else esito.fileNonCopiati.push(`${percorso} (${/mime|type/i.test(error.message) ? 'formato non ammesso' : 'caricamento non riuscito'})`);
  }
  return esito;
}
