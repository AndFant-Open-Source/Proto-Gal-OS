// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { supabase } from '@/lib/supabase';
import { leggiTutto } from '@/hooks/useProtocolli';
import type {
  DatiFascicolo, DocumentoFascicolo, Fascicolo, FiltriFascicolo, LogAzione, StatoFascicolo, VoceTitolario,
} from '@/types';

// Numero, anno, stato iniziale, autore e storico li gestisce il database
// (sezione 9 di supabase/schema.sql): qui solo letture e dati compilabili.

const CAMPI_FASCICOLO = '*, titolario:protocollo_titolario(id, codice, descrizione)';

const CAMPI_DOCUMENTO = `*,
  protocollo:protocollo_registro(id, numero_completo, tipo_flusso, data_registrazione, oggetto,
    mittente_nome, destinatario_nome, protocollo_allegati(*)),
  contratto:protocollo_contratti(id, numero_completo, data_repertorio, oggetto, contraente_nome,
    protocollo_contratti_allegati(*))`;

/** Messaggio comprensibile per gli errori più frequenti del database */
export function messaggioErroreFascicolo(err: unknown, predefinito: string): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') {
    if (e.message?.includes('riferimento_esterno')) return 'Il riferimento esterno è già usato da un altro fascicolo.';
    if (e.message?.includes('titolario')) return 'Esiste già una voce di titolario con questo codice.';
    return 'Il documento è già presente in questo fascicolo.';
  }
  if (e?.code === '42501') return 'Operazione non consentita: il fascicolo è chiuso o il tuo ruolo non lo permette.';
  if (e?.code === '23503') return 'Il fascicolo contiene documenti: scollegali prima di eliminarlo.';
  if (e?.code === '22023') return e.message ?? predefinito;
  if (e?.code === '23514') return 'Dati non validi: controlla i campi inseriti.';
  return predefinito;
}

// ── Titolario ─────────────────────────────────────────────────────────────────

export async function getTitolario(): Promise<VoceTitolario[]> {
  const { data, error } = await supabase.from('protocollo_titolario').select('*');
  if (error) throw error;
  // Ordine naturale dei codici: 2, 2.1, 10 (non 10, 2, 2.1)
  return (data as VoceTitolario[]).sort((a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true }));
}

export async function salvaVoceTitolario(
  voce: Pick<VoceTitolario, 'codice' | 'descrizione' | 'padre_id' | 'attivo'>,
  id?: string,
): Promise<void> {
  const { error } = id
    ? await supabase.from('protocollo_titolario').update(voce).eq('id', id)
    : await supabase.from('protocollo_titolario').insert(voce);
  if (error) throw error;
}

// ── Fascicoli ─────────────────────────────────────────────────────────────────

export async function getFascicoli(filtri: FiltriFascicolo = {}): Promise<Fascicolo[]> {
  // Rimuove i caratteri con significato sintattico nel filtro PostgREST .or()
  const testo = filtri.testo?.replace(/[,()*%\\"]/g, ' ').trim();
  return leggiTutto<Fascicolo>((da, a) => {
    let query = supabase
      .from('protocollo_fascicoli')
      .select(`${CAMPI_FASCICOLO}, documenti:protocollo_fascicoli_documenti(count)`);
    if (filtri.anno) query = query.eq('anno', filtri.anno);
    if (filtri.stato) query = query.eq('stato', filtri.stato);
    if (filtri.titolario_id) query = query.eq('titolario_id', filtri.titolario_id);
    if (testo) {
      query = query.or(
        `oggetto.ilike.%${testo}%,numero_completo.ilike.%${testo}%,riferimento_esterno.ilike.%${testo}%,responsabile.ilike.%${testo}%`
      );
    }
    return query.order('anno', { ascending: false }).order('numero', { ascending: false }).range(da, a);
  });
}

/** Elenco breve per i menu di scelta (filtro del registro, collegamento di un documento) */
export async function getElencoFascicoli(soloAperti = false): Promise<Pick<Fascicolo, 'id' | 'numero_completo' | 'oggetto' | 'stato'>[]> {
  return leggiTutto((da, a) => {
    let query = supabase.from('protocollo_fascicoli').select('id, numero_completo, oggetto, stato');
    if (soloAperti) query = query.eq('stato', 'aperto');
    return query.order('anno', { ascending: false }).order('numero', { ascending: false }).range(da, a);
  });
}

export async function getFascicolo(id: string): Promise<Fascicolo> {
  const { data, error } = await supabase.from('protocollo_fascicoli').select(CAMPI_FASCICOLO).eq('id', id).single();
  if (error) throw error;
  return data as Fascicolo;
}

export async function creaFascicolo(dati: DatiFascicolo): Promise<Fascicolo> {
  const { data, error } = await supabase.from('protocollo_fascicoli').insert(dati).select(CAMPI_FASCICOLO).single();
  if (error) throw error;
  return data as Fascicolo;
}

export async function aggiornaFascicolo(
  id: string,
  dati: Partial<DatiFascicolo> & { stato?: StatoFascicolo },
): Promise<Fascicolo> {
  const { data, error } = await supabase.from('protocollo_fascicoli').update(dati).eq('id', id)
    .select(CAMPI_FASCICOLO).single();
  if (error) throw error;
  return data as Fascicolo;
}

export async function eliminaFascicolo(id: string): Promise<void> {
  const { data, error } = await supabase.from('protocollo_fascicoli').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw Object.assign(new Error('Eliminazione non consentita'), { code: '42501' });
}

export async function getLogFascicolo(id: string): Promise<LogAzione[]> {
  const { data, error } = await supabase
    .from('protocollo_log_azioni')
    .select('*, profilo:protocollo_profili(nome_completo, ruolo)')
    .eq('fascicolo_id', id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as LogAzione[];
}

// ── Documenti del fascicolo ───────────────────────────────────────────────────

/** Data del documento: protocollazione o repertorio */
export function dataDocumento(d: DocumentoFascicolo): string {
  return d.protocollo?.data_registrazione ?? d.contratto?.data_repertorio ?? d.created_at;
}

/** Documenti in ordine di data (dal più vecchio): la storia della pratica */
export async function getDocumentiFascicolo(fascicoloId: string): Promise<DocumentoFascicolo[]> {
  const { data, error } = await supabase
    .from('protocollo_fascicoli_documenti')
    .select(CAMPI_DOCUMENTO)
    .eq('fascicolo_id', fascicoloId);
  if (error) throw error;
  return (data as DocumentoFascicolo[]).sort((a, b) => dataDocumento(a).localeCompare(dataDocumento(b)));
}

export type RiferimentoDocumento = { protocollo_id: string } | { contratto_id: string };

/** Fascicoli in cui è inserito un protocollo o un contratto */
export async function getFascicoliDelDocumento(rif: RiferimentoDocumento): Promise<DocumentoFascicolo[]> {
  const [colonna, valore] = 'protocollo_id' in rif ? ['protocollo_id', rif.protocollo_id] : ['contratto_id', rif.contratto_id];
  const { data, error } = await supabase
    .from('protocollo_fascicoli_documenti')
    .select('*, fascicolo:protocollo_fascicoli(id, numero_completo, oggetto, stato)')
    .eq(colonna, valore)
    .order('created_at');
  if (error) throw error;
  return data as DocumentoFascicolo[];
}

export async function collegaDocumento(fascicoloId: string, rif: RiferimentoDocumento): Promise<void> {
  const { error } = await supabase.from('protocollo_fascicoli_documenti').insert({ fascicolo_id: fascicoloId, ...rif });
  if (error) throw error;
}

export async function scollegaDocumento(collegamentoId: string): Promise<void> {
  const { data, error } = await supabase.from('protocollo_fascicoli_documenti').delete().eq('id', collegamentoId).select('id');
  if (error) throw error;
  // Nessuna riga eliminata: fascicolo chiuso o permesso mancante (regole del database)
  if (!data?.length) throw Object.assign(new Error('Scollegamento non consentito'), { code: '42501' });
}

/** Ricerca di protocolli e contratti da aggiungere a un fascicolo */
export async function cercaDocumenti(testo: string): Promise<{
  protocolli: { id: string; numero_completo: string; oggetto: string; data_registrazione: string }[];
  contratti: { id: string; numero_completo: string; oggetto: string; data_repertorio: string }[];
}> {
  const t = testo.replace(/[,()*%\\"]/g, ' ').trim();
  if (t.length < 2) return { protocolli: [], contratti: [] };
  const [p, c] = await Promise.all([
    supabase.from('protocollo_registro').select('id, numero_completo, oggetto, data_registrazione')
      .or(`numero_completo.ilike.%${t}%,oggetto.ilike.%${t}%,mittente_nome.ilike.%${t}%,destinatario_nome.ilike.%${t}%`)
      .order('data_registrazione', { ascending: false }).limit(15),
    supabase.from('protocollo_contratti').select('id, numero_completo, oggetto, data_repertorio')
      .or(`numero_completo.ilike.%${t}%,oggetto.ilike.%${t}%,contraente_nome.ilike.%${t}%`)
      .order('data_repertorio', { ascending: false }).limit(10),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  return { protocolli: p.data ?? [], contratti: c.data ?? [] };
}
