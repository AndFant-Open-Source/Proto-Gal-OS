// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { supabase } from './supabase';
import type { TipoFlusso } from '@/types';

// Il numero definitivo lo assegna il database al momento dell'inserimento
// (trigger protocollo_proteggi_campi, supabase/schema.sql): qui solo l'anteprima.

/**
 * Legge il prossimo numero previsto SENZA incrementare il contatore.
 * Usare per l'anteprima nel form "Nuovo Protocollo".
 */
export async function getProssimoNumeroPreview(
  anno: number,
  tipoFlusso: TipoFlusso
): Promise<number> {
  const { data, error } = await supabase
    .from('protocollo_sequenze')
    .select('ultimo_numero')
    .eq('anno', anno)
    .eq('tipo_flusso', tipoFlusso)
    .maybeSingle();
  if (error) throw new Error(`Errore preview numerazione: ${error.message}`);
  return (data?.ultimo_numero ?? 0) + 1;
}

/**
 * Lettera della serie: A = arrivo (entrata), U = partenza (uscita).
 */
export function letteraSerie(tipoFlusso: TipoFlusso): 'A' | 'U' {
  return tipoFlusso === 'arrivo' ? 'A' : 'U';
}

/**
 * Formatta il numero completo nel formato A/NNNN/ANNO (entrata) o U/NNNN/ANNO (uscita).
 * Deve restare allineato alla colonna generata numero_completo (supabase/schema.sql).
 */
export function formatNumeroCompleto(
  anno: number,
  numero: number,
  tipoFlusso: TipoFlusso
): string {
  return `${letteraSerie(tipoFlusso)}/${String(numero).padStart(4, '0')}/${anno}`;
}
