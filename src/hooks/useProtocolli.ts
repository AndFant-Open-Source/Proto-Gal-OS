// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { stampigliaPdf, nomeFileStampigliato } from '@/lib/stampigliatura';
import { nomeFileSicuro, tipoMimeFile } from '@/lib/utils';
import type { Protocollo, FiltriProtocollo, Allegato, LogAzione, DatiStampigliatura, AggiornamentoProtocollo, Registro } from '@/types';

const PAGE_SIZE = 20;

export function useProtocolli() {
  const [protocolli, setProtocolli] = useState<Protocollo[]>([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async (
    filtri: FiltriProtocollo = {},
    pagina = 0,
    ordinamento: { colonna: string; ascendente: boolean } = { colonna: 'created_at', ascendente: false }
  ) => {
    setLoading(true);
    setErrore(null);
    try {
      // Filtro per fascicolo: solo i protocolli collegati (join interna sui documenti del fascicolo)
      const campi: string = filtri.fascicolo
        ? '*, protocollo_allegati(*), protocollo_fascicoli_documenti!inner(fascicolo_id)'
        : '*, protocollo_allegati(*)';
      let query = supabase
        .from('protocollo_registro')
        .select<string, Protocollo>(campi, { count: 'exact' });

      query = query.eq('registro', filtri.registro ?? 'ordinario');
      if (filtri.fascicolo) query = query.eq('protocollo_fascicoli_documenti.fascicolo_id', filtri.fascicolo);

      if (filtri.anno) query = query.eq('anno', filtri.anno);
      if (filtri.tipo_flusso) query = query.eq('tipo_flusso', filtri.tipo_flusso);
      if (filtri.canale) query = query.eq('canale', filtri.canale);
      if (filtri.stato) query = query.eq('stato', filtri.stato);
      if (filtri.ufficio) query = query.eq('ufficio_assegnatario', filtri.ufficio);
      // Rimuove i caratteri con significato sintattico nel filtro PostgREST .or()
      // (virgole, parentesi, ecc.) per evitare che il testo cercato alteri la query
      const testo = filtri.testo?.replace(/[,()*%\\"]/g, ' ').trim();
      if (testo) {
        query = query.or(
          `oggetto.ilike.%${testo}%,mittente_nome.ilike.%${testo}%,destinatario_nome.ilike.%${testo}%,numero_completo.ilike.%${testo}%`
        );
      }

      query = query
        .order(ordinamento.colonna, { ascending: ordinamento.ascendente })
        .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      setProtocolli(data as Protocollo[]);
      setTotale(count ?? 0);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, []);

  return { protocolli, totale, loading, errore, carica, pageSize: PAGE_SIZE };
}

export async function getProtocollo(id: string): Promise<Protocollo> {
  const { data, error } = await supabase
    .from('protocollo_registro')
    .select('*, protocollo_allegati(*)')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as Protocollo;
}

/**
 * Registra un protocollo. Numero, anno, data di registrazione e operatore li assegna
 * il database (trigger protocollo_proteggi_campi, migrazione 2026-10e), nella stessa
 * transazione dell'inserimento: il numero restituito è quello definitivo.
 */
export async function creaProtocollo(
  dati: Omit<Protocollo,
    'id' | 'created_at' | 'updated_at' | 'protocollo_allegati' | 'numero_completo' |
    'numero' | 'anno' | 'data_registrazione' | 'operatore_id' | 'registro'>
): Promise<Protocollo> {
  const { data, error } = await supabase
    .from('protocollo_registro')
    .insert(dati)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Protocollo;
}

export async function eliminaProtocollo(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('protocollo_registro')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  // Supabase non genera errore quando l'RLS blocca silenziosamente il DELETE
  // (restituisce 0 righe eliminate senza errore). Lo rileviamo qui.
  if (!data || data.length === 0) {
    throw new Error('Eliminazione non autorizzata: solo gli amministratori possono eliminare i protocolli.');
  }
}

export async function aggiornaProtocollo(
  id: string,
  dati: AggiornamentoProtocollo
): Promise<Protocollo> {
  const { data, error } = await supabase
    .from('protocollo_registro')
    .update({ ...dati, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Protocollo;
}

export async function caricaAllegato(
  protocolloId: string,
  file: File,
  utenteId: string
): Promise<Allegato> {
  // Supabase Storage rifiuta chiavi con accenti, spazi speciali e alcuni simboli:
  // il path usa un nome "pulito", il nome originale resta in nome_file
  const nomeFile = `${Date.now()}_${nomeFileSicuro(file.name)}`;
  const storagePath = `${protocolloId}/${nomeFile}`;
  // Se il browser non rileva il MIME type, lo deduciamo dall'estensione; va passato
  // esplicitamente, altrimenti il bucket (che ammette solo certi tipi) può rifiutare il file
  const tipoMime = tipoMimeFile(file);

  const { error: uploadError } = await supabase.storage
    .from('allegati-protocollo')
    .upload(storagePath, file, { contentType: tipoMime || 'application/octet-stream' });
  if (uploadError) throw new Error(`Upload fallito: ${uploadError.message}`);

  const { data, error } = await supabase
    .from('protocollo_allegati')
    .insert({
      protocollo_id: protocolloId,
      nome_file: file.name,
      storage_path: storagePath,
      dimensione_bytes: file.size,
      tipo_mime: tipoMime,
      caricato_da: utenteId,
    })
    .select()
    .single();
  if (error) {
    // Evita file orfani nello storage se la registrazione a DB fallisce
    await supabase.storage.from('allegati-protocollo').remove([storagePath]);
    throw new Error(error.message);
  }
  return data as Allegato;
}

/** Ciò che serve per scaricare/visualizzare un file: vale per allegati di protocolli e contratti */
export type FileArchiviato = Pick<Allegato, 'nome_file' | 'storage_path' | 'tipo_mime'>;

// Avvia il download di un Blob. La revoca dell'URL è differita: revocarlo
// subito dopo click() può annullare il download in alcuni browser (es. Firefox)
function salvaBlob(blob: Blob, nomeFile: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadAllegato(allegato: FileArchiviato): Promise<void> {
  const { data, error } = await supabase.storage
    .from('allegati-protocollo')
    .download(allegato.storage_path);
  if (error) throw new Error(error.message);
  salvaBlob(data, allegato.nome_file);
}

export async function eliminaAllegato(allegato: Allegato): Promise<void> {
  // 1. Prima il record a DB: è ciò che l'utente vede. Con .select() si rileva
  //    anche il blocco "silenzioso" dell'RLS (0 righe eliminate, nessun errore).
  const { data, error } = await supabase
    .from('protocollo_allegati')
    .delete()
    .eq('id', allegato.id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('Eliminazione allegato non autorizzata');
  }

  // 2. Poi il file fisico. Se fallisce (file già assente o policy storage mancante)
  //    il record è comunque rimosso: non blocchiamo l'utente, lasciamo traccia in console.
  const { error: storageError } = await supabase.storage
    .from('allegati-protocollo')
    .remove([allegato.storage_path]);
  if (storageError) {
    console.warn('File allegato non rimosso dallo storage:', allegato.storage_path, storageError.message);
  }
}

export async function logAzione(
  protocolloId: string | undefined,
  utenteId: string,
  azione: string,
  dettaglio?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('protocollo_log_azioni').insert({
    protocollo_id: protocolloId,
    utente_id: utenteId,
    azione,
    dettaglio,
  });
  // Il log non deve bloccare l'operazione principale, ma l'errore non va perso
  if (error) console.warn('Registrazione log azione fallita:', azione, error.message);
}

/** Annullamento (solo admin, motivo obbligatorio): il numero resta occupato e non si riassegna */
export async function annullaProtocollo(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('protocollo_annulla', { p_protocollo_id: id, p_motivo: motivo });
  if (error) throw error;
}

/** Dati utili per la timbratura di un protocollo (serie PEC con etichetta "PEC") */
export function datiTimbro(p: Pick<Protocollo, 'numero_completo' | 'tipo_flusso' | 'registro'>, nomeEnte: string): DatiStampigliatura {
  return {
    nome_gal: nomeEnte,
    numero_protocollo: p.numero_completo,
    tipo_flusso: p.tipo_flusso,
    registro: p.registro === 'pec' ? 'pec' : undefined,
    data_stampa: new Date().toISOString(),
  };
}

export async function getLogAzioni(protocolloId: string): Promise<LogAzione[]> {
  const { data, error } = await supabase
    .from('protocollo_log_azioni')
    .select('*, profilo:protocollo_profili(nome_completo, ruolo)')
    .eq('protocollo_id', protocolloId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as LogAzione[];
}

// Supabase restituisce al massimo 1000 righe per richiesta (impostazione "Max rows"):
// per le esportazioni si legge a blocchi fino a esaurimento
const BLOCCO_ESPORTAZIONE = 1000;

export async function leggiTutto<T>(
  richiesta: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const tutti: T[] = [];
  for (let da = 0; ; da += BLOCCO_ESPORTAZIONE) {
    const { data, error } = await richiesta(da, da + BLOCCO_ESPORTAZIONE - 1);
    if (error) throw new Error(error.message);
    tutti.push(...(data ?? []));
    if (!data || data.length < BLOCCO_ESPORTAZIONE) return tutti;
  }
}

export async function getTuttiProtocolli(anno?: number, registro: Registro = 'ordinario'): Promise<Protocollo[]> {
  return leggiTutto<Protocollo>((da, a) => {
    let query = supabase
      .from('protocollo_registro')
      .select('*')
      .eq('registro', registro)
      .order('tipo_flusso', { ascending: true })
      .order('numero', { ascending: true });
    if (anno) query = query.eq('anno', anno);
    return query.range(da, a);
  });
}

/**
 * Apre un allegato in una nuova scheda del browser tramite URL firmato temporaneo (1 ora).
 */
export async function visualizzaAllegato(allegato: FileArchiviato): Promise<void> {
  const { data, error } = await supabase.storage
    .from('allegati-protocollo')
    .createSignedUrl(allegato.storage_path, 3600);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Scarica un allegato PDF con la stampigliatura di protocollo sovrapposta.
 */
export async function downloadAllegatoStampigliato(
  allegato: FileArchiviato,
  dati: DatiStampigliatura
): Promise<void> {
  const { data, error } = await supabase.storage
    .from('allegati-protocollo')
    .download(allegato.storage_path);
  if (error) throw new Error(error.message);

  const isPdf = allegato.tipo_mime === 'application/pdf' ||
    allegato.nome_file.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    // Per file non PDF, scarica senza stampigliatura
    salvaBlob(data, allegato.nome_file);
    return;
  }

  const arrayBuffer = await data.arrayBuffer();
  const stampigliato = await stampigliaPdf(arrayBuffer, dati);
  const blob = new Blob([stampigliato.buffer as ArrayBuffer], { type: 'application/pdf' });
  salvaBlob(blob, nomeFileStampigliato(dati.numero_protocollo, allegato.nome_file));
}
