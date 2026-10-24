// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { nomeFileSicuro, tipoMimeFile } from '@/lib/utils';
import { leggiTutto } from '@/hooks/useProtocolli';
import type {
  Contratto, DatiContratto, AllegatoContratto, FiltriContratto, LogAzione,
} from '@/types';

const PAGE_SIZE = 20;
const BUCKET = 'allegati-protocollo';

/** Payload di aggiornamento: null svuota un campo, undefined lo lascia invariato */
export type AggiornamentoContratto = {
  [K in keyof Contratto]?: Contratto[K] | null;
};

export function useContratti() {
  const [contratti, setContratti] = useState<Contratto[]>([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async (
    filtri: FiltriContratto = {},
    pagina = 0,
    ordinamento: { colonna: string; ascendente: boolean } = { colonna: 'numero', ascendente: false }
  ) => {
    setLoading(true);
    setErrore(null);
    try {
      let query = supabase
        .from('protocollo_contratti')
        .select('*, protocollo_contratti_allegati(id)', { count: 'exact' });

      if (filtri.anno) query = query.eq('anno', filtri.anno);
      if (filtri.tipo_contratto) query = query.eq('tipo_contratto', filtri.tipo_contratto);
      if (filtri.stato) query = query.eq('stato', filtri.stato);

      // Caratteri con significato sintattico nel filtro .or() di PostgREST rimossi
      const testo = filtri.testo?.replace(/[,()*%\\"]/g, ' ').trim();
      if (testo) {
        query = query.or(
          `oggetto.ilike.%${testo}%,contraente_nome.ilike.%${testo}%,numero_completo.ilike.%${testo}%,cig.ilike.%${testo}%,cup.ilike.%${testo}%`
        );
      }

      query = query
        .order(ordinamento.colonna, { ascending: ordinamento.ascendente })
        .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      setContratti(data as Contratto[]);
      setTotale(count ?? 0);
    } catch (e) {
      console.error('Caricamento repertorio fallito:', e);
      setErrore('Impossibile caricare il repertorio contratti');
    } finally {
      setLoading(false);
    }
  }, []);

  return { contratti, totale, loading, errore, carica, pageSize: PAGE_SIZE };
}

// ── Numerazione ──────────────────────────────────────────────────────────────

// Il numero definitivo lo assegna il database all'inserimento
// (trigger contratti_proteggi_campi, supabase/schema.sql): qui solo l'anteprima.

/** Anteprima del prossimo numero, SENZA incrementare il contatore */
export async function getProssimoNumeroContrattoPreview(anno: number): Promise<number> {
  const { data, error } = await supabase
    .from('protocollo_contratti_sequenze')
    .select('ultimo_numero')
    .eq('anno', anno)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.ultimo_numero ?? 0) + 1;
}

/** Formato del repertorio: C/NNNN/AAAA (allineato alla colonna generata a DB) */
export function formatNumeroContratto(anno: number, numero: number): string {
  return `C/${String(numero).padStart(4, '0')}/${anno}`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getContratto(id: string): Promise<Contratto> {
  const { data, error } = await supabase
    .from('protocollo_contratti')
    .select('*, protocollo_contratti_allegati(*)')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as Contratto;
}

/** Numero, anno, data di repertorio e operatore li assegna il database nell'inserimento */
export async function creaContratto(dati: DatiContratto): Promise<Contratto> {
  const { data, error } = await supabase
    .from('protocollo_contratti')
    .insert(dati)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Contratto;
}

export async function aggiornaContratto(id: string, dati: AggiornamentoContratto): Promise<Contratto> {
  const { data, error } = await supabase
    .from('protocollo_contratti')
    .update(dati)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Contratto;
}

export async function eliminaContratto(contratto: Contratto): Promise<void> {
  const { data, error } = await supabase
    .from('protocollo_contratti')
    .delete()
    .eq('id', contratto.id)
    .select('id');
  if (error) throw new Error(error.message);
  // L'RLS blocca il DELETE in silenzio (0 righe): lo rendiamo esplicito
  if (!data || data.length === 0) {
    throw new Error('Eliminazione non autorizzata: solo gli amministratori possono eliminare i contratti.');
  }
  // Il CASCADE elimina i record degli allegati, non i file: li rimuoviamo qui
  const percorsi = (contratto.protocollo_contratti_allegati ?? []).map((a) => a.storage_path);
  if (percorsi.length > 0) {
    const { error: errStorage } = await supabase.storage.from(BUCKET).remove(percorsi);
    if (errStorage) console.warn('File allegati non rimossi dallo storage:', errStorage.message);
  }
}

/** Tutti i contratti per l'esportazione (letti a blocchi: niente limite delle 1000 righe) */
export async function getTuttiContratti(anno?: number): Promise<Contratto[]> {
  return leggiTutto<Contratto>((da, a) => {
    let query = supabase
      .from('protocollo_contratti')
      .select('*')
      .order('anno', { ascending: true })
      .order('numero', { ascending: true });
    if (anno) query = query.eq('anno', anno);
    return query.range(da, a);
  });
}

// ── Allegati ─────────────────────────────────────────────────────────────────

export async function caricaAllegatoContratto(
  contrattoId: string,
  file: File,
  utenteId: string
): Promise<AllegatoContratto> {
  const storagePath = `contratti/${contrattoId}/${Date.now()}_${nomeFileSicuro(file.name)}`;
  const tipoMime = tipoMimeFile(file);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: tipoMime || 'application/octet-stream' });
  if (uploadError) throw new Error(`Upload fallito: ${uploadError.message}`);

  const { data, error } = await supabase
    .from('protocollo_contratti_allegati')
    .insert({
      contratto_id: contrattoId,
      nome_file: file.name,
      storage_path: storagePath,
      dimensione_bytes: file.size,
      tipo_mime: tipoMime,
      caricato_da: utenteId,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }
  return data as AllegatoContratto;
}

export async function eliminaAllegatoContratto(allegato: AllegatoContratto): Promise<void> {
  const { data, error } = await supabase
    .from('protocollo_contratti_allegati')
    .delete()
    .eq('id', allegato.id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Eliminazione allegato non autorizzata');

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([allegato.storage_path]);
  if (storageError) {
    console.warn('File allegato non rimosso dallo storage:', allegato.storage_path, storageError.message);
  }
}

// ── Storico ──────────────────────────────────────────────────────────────────

export async function logAzioneContratto(
  contrattoId: string,
  utenteId: string,
  azione: string,
  dettaglio?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('protocollo_log_azioni').insert({
    contratto_id: contrattoId,
    utente_id: utenteId,
    azione,
    dettaglio,
  });
  if (error) console.warn('Registrazione log azione fallita:', azione, error.message);
}

export async function getLogContratto(contrattoId: string): Promise<LogAzione[]> {
  const { data, error } = await supabase
    .from('protocollo_log_azioni')
    .select('*, profilo:protocollo_profili(nome_completo, ruolo)')
    .eq('contratto_id', contrattoId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as LogAzione[];
}
