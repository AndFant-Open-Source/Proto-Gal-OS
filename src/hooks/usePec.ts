// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { leggiTutto } from '@/hooks/useProtocolli';
import type { FileArchiviato } from '@/hooks/useProtocolli';
import type { FilePec, ImportazionePec, MessaggioPec, StatoPec, TipoFlusso } from '@/types';

// La coda la riempie la Edge Function pec-importa (lato server); numeri e date li assegna
// protocollo_pec_protocolla (supabase/schema.sql, sezione 10). Qui letture e correzioni.

export const LABEL_STATO_PEC: Record<StatoPec, string> = {
  da_verificare: 'Da verificare',
  pronto: 'Pronte',
  anomalia: 'Anomalie',
  protocollato: 'Protocollate',
  scartato: 'Scartate',
};

const SPIEGAZIONE: Record<string, string> = {
  eml_mancante: 'Nel foglio manca il link al file EML originale',
  file_non_accessibile: 'File non accessibile su Drive (va condiviso con l\'account di servizio del protocollo)',
  file_troppo_grande: 'File oltre 50 MB',
  file_non_scaricato: 'File non scaricato da Drive',
  sha256_diverso: 'Impronta SHA-256 diversa da quella dell\'indice: il file potrebbe essere stato modificato',
  allegato_mancante: 'Nel foglio Allegati manca il link al file',
  data_mancante: 'Nessuna data disponibile per la PEC',
  duplicato: 'La stessa PEC (stesso file o Message-ID) è già in coda',
  data_non_certificata: 'Data non certificata: si userà la data dell\'email',
  direzione_da_indicare: 'Indicare se la PEC è in entrata o in uscita',
  numero_allegati_diverso: 'Il numero di allegati non corrisponde a quello dell\'indice',
  pdf_creato_dal_protocollo: 'PDF della PEC non disponibile: creata una scheda con i dati dell\'indice',
  pdf_non_scaricato: 'PDF della PEC non scaricato da Drive: creata una scheda con i dati dell\'indice',
  eml_non_leggibile: 'Il file EML non è stato interpretato (resta comunque archiviato)',
  caratteri_non_decodificati: 'Alcuni caratteri del testo non sono stati decodificati correttamente',
};

/** "file_non_accessibile:EML" → testo comprensibile */
export function spiegaSegnalazione(codice: string): string {
  const [base, dettaglio] = codice.split(/:(.*)/s);
  const testo = SPIEGAZIONE[base] ?? base.replace(/_/g, ' ');
  return dettaglio ? `${testo}: ${dettaglio}` : testo;
}

export function comeFileArchiviato(f: FilePec): FileArchiviato {
  return { nome_file: f.nome_file, storage_path: f.storage_path, tipo_mime: f.tipo_mime ?? undefined };
}

// ── Coda ──────────────────────────────────────────────────────────────────────

export async function getCodaPec(stato: StatoPec): Promise<MessaggioPec[]> {
  return leggiTutto<MessaggioPec>((da, a) =>
    supabase
      .from('protocollo_pec_messaggi')
      .select('*, protocollo_pec_file(*)')
      .eq('tipo', 'messaggio')
      .eq('stato', stato)
      .order('data_pec', { ascending: true, nullsFirst: false })
      .order('id')
      .range(da, a));
}

export async function contaCodaPec(): Promise<Record<StatoPec, number>> {
  const stati: StatoPec[] = ['da_verificare', 'pronto', 'anomalia', 'scartato'];
  const conteggi = await Promise.all(stati.map(async (stato) => {
    const { count, error } = await supabase.from('protocollo_pec_messaggi')
      .select('id', { count: 'exact', head: true }).eq('tipo', 'messaggio').eq('stato', stato);
    if (error) throw error;
    return [stato, count ?? 0] as const;
  }));
  return { protocollato: 0, ...Object.fromEntries(conteggi) } as Record<StatoPec, number>;
}

export type CorrezionePec = Partial<Pick<MessaggioPec, 'direzione' | 'oggetto' | 'stato' | 'note_verifica'>>;

export async function aggiornaMessaggioPec(id: string, dati: CorrezionePec): Promise<MessaggioPec> {
  const { data, error } = await supabase.from('protocollo_pec_messaggi').update(dati).eq('id', id)
    .select('*, protocollo_pec_file(*)').single();
  if (error) throw error;
  return data as MessaggioPec;
}

/** Solo admin, solo PEC non protocollate: la riga torna importabile alla prossima importazione */
export async function togliDallaCoda(id: string): Promise<void> {
  const { data, error } = await supabase.from('protocollo_pec_messaggi').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw Object.assign(new Error('Operazione non consentita'), { code: '42501' });
}

/** Data dell'ultima PEC protocollata per serie (anno-tipo): serve a riconoscere le PEC in ritardo */
export async function ultimeDatePec(serie: { anno: number; tipo: TipoFlusso }[]): Promise<Map<string, string>> {
  const uniche = [...new Map(serie.map((s) => [`${s.anno}-${s.tipo}`, s])).values()];
  const risultati = await Promise.all(uniche.map(async (s) => {
    const { data, error } = await supabase.from('protocollo_registro').select('data_registrazione')
      .eq('registro', 'pec').eq('anno', s.anno).eq('tipo_flusso', s.tipo)
      .order('data_registrazione', { ascending: false }).limit(1);
    if (error) throw error;
    return [`${s.anno}-${s.tipo}`, data?.[0]?.data_registrazione as string | undefined] as const;
  }));
  const ultime = new Map<string, string>();
  for (const [chiave, data] of risultati) if (data) ultime.set(chiave, data);
  return ultime;
}

/** Ultimo numero assegnato per serie PEC (anteprima dei numeri prima della protocollazione) */
export async function contatoriPec(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('protocollo_sequenze').select('anno, tipo_flusso, ultimo_numero').eq('registro', 'pec');
  if (error) throw error;
  return new Map((data ?? []).map((s) => [`${s.anno}-${s.tipo_flusso}`, s.ultimo_numero as number]));
}

/** Anno della PEC nel fuso italiano (una PEC del 31/12 alle 23:30 UTC è del 1° gennaio) */
export function annoPec(dataPec: string): number {
  return Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', year: 'numeric' }).format(new Date(dataPec)));
}

export class PecInRitardo extends Error {}

export async function protocollaPec(
  ids: string[],
  fascicoloId: string | null,
  confermaRitardo: boolean,
): Promise<{ messaggio_id: string; protocollo_id: string; numero_completo: string }[]> {
  const { data, error } = await supabase.rpc('protocollo_pec_protocolla', {
    p_messaggi: ids,
    p_fascicolo_id: fascicoloId,
    p_conferma_ritardo: confermaRitardo,
  });
  if (error) {
    if (error.message?.includes('PEC_IN_RITARDO')) throw new PecInRitardo(error.message);
    throw error;
  }
  return data ?? [];
}

// ── Dettaglio di un protocollo PEC ────────────────────────────────────────────

export async function getPecDelProtocollo(protocolloId: string): Promise<{ messaggio: MessaggioPec | null; ricevute: MessaggioPec[] }> {
  const { data: messaggio, error } = await supabase.from('protocollo_pec_messaggi').select('*, protocollo_pec_file(*)')
    .eq('protocollo_id', protocolloId).maybeSingle();
  if (error) throw error;
  if (!messaggio) return { messaggio: null, ricevute: [] };
  const { data: ricevute, error: erroreRicevute } = await supabase.from('protocollo_pec_messaggi')
    .select('*, protocollo_pec_file(*)').eq('ricevuta_di', messaggio.id).order('data_pec');
  if (erroreRicevute) throw erroreRicevute;
  return { messaggio: messaggio as MessaggioPec, ricevute: (ricevute ?? []) as MessaggioPec[] };
}

// ── Importazione da Google Drive ──────────────────────────────────────────────

export async function getImportazioniPec(): Promise<ImportazionePec[]> {
  const { data, error } = await supabase.from('protocollo_pec_importazioni').select('*')
    .order('avviata_il', { ascending: false }).limit(30);
  if (error) throw error;
  return data as ImportazionePec[];
}

export interface EsitoChiamataImportazione {
  importazione_id: string;
  righe_indice: number;
  importate_ora: number;
  nuove: number;
  anomalie: number;
  rimanenti: number;
  completata: boolean;
}

const ERRORI_IMPORTAZIONE: Record<string, string> = {
  configurazione_mancante: 'L\'importazione non è ancora configurata: mancano le chiavi Google nei segreti di Supabase (vedi la guida di installazione).',
  google_non_autorizzato: 'Google ha rifiutato l\'accesso: controllare la chiave dell\'account di servizio.',
  foglio_non_trovato: 'Foglio GAL_Indice_PEC non raggiungibile: controllare l\'ID del foglio e che sia condiviso con l\'account di servizio.',
  foglio_non_valido: 'Il foglio non ha le colonne attese ("ID acquisizione", "Link originale EML").',
  importazione_in_corso: 'Un\'altra importazione è in corso: riprovare tra qualche minuto.',
  non_autorizzato: 'L\'importazione è riservata a operatori e amministratori.',
  non_autenticato: 'Sessione scaduta: accedere di nuovo.',
  archivio_errore: 'Salvataggio dei file nell\'archivio non riuscito: controllare il limite di 50 MB nelle impostazioni di Storage.',
};

export class ErroreImportazionePec extends Error {}

/** Errore registrato di un'importazione ("codice: dettaglio") in parole comprensibili */
export function spiegaErroreImportazione(errore: string | null): string {
  if (!errore) return '';
  return ERRORI_IMPORTAZIONE[errore.split(':')[0]] ?? 'Interrotta per un errore imprevisto';
}

/** Una chiamata alla funzione: importa un blocco di righe e dice quante ne restano */
export async function chiamaImportazione(importazioneId: string | null): Promise<EsitoChiamataImportazione> {
  const { data, error } = await supabase.functions.invoke('pec-importa', {
    body: importazioneId ? { importazione_id: importazioneId } : {},
  });
  if (error) {
    let codice = '';
    if (error instanceof FunctionsHttpError) {
      const corpo = await error.context.json().catch(() => null) as { errore?: string } | null;
      codice = corpo?.errore ?? '';
      if (!codice && error.context.status === 404) {
        throw new ErroreImportazionePec('La funzione di importazione non è installata su Supabase (vedi la guida di installazione).');
      }
    } else {
      throw new ErroreImportazionePec('La funzione di importazione non risponde: verificare che sia installata su Supabase.');
    }
    throw new ErroreImportazionePec(ERRORI_IMPORTAZIONE[codice] ?? 'Importazione interrotta per un errore imprevisto: riprovare.');
  }
  return data as EsitoChiamataImportazione;
}
