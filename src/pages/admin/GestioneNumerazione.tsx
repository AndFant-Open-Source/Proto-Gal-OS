// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState, useEffect, useCallback } from 'react';
import { Hash, RefreshCw, AlertTriangle, ArrowDownCircle, ArrowUpCircle, ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { NOME_ENTE } from '@/lib/ente';
import { formatNumeroCompleto } from '@/lib/numerazione';
import { formatNumeroContratto } from '@/hooks/useContratti';
import { leggiTutto } from '@/hooks/useProtocolli';
import type { SequenzaNumerazione, TipoFlusso } from '@/types';
import { toast } from 'sonner';

interface LacunaInfo {
  anno: number;
  tipo_flusso: TipoFlusso;
  numeri_mancanti: number[];
}

const ETICHETTA: Record<TipoFlusso, string> = { arrivo: 'Arrivo', partenza: 'Partenza' };

/** Numeri mancanti da 1 al massimo presente (tutti i numeri letti, senza limite di 1000 righe) */
async function trovaLacune(anno: number, tipo: TipoFlusso): Promise<LacunaInfo | null> {
  const righe = await leggiTutto<{ numero: number }>((da, a) =>
    supabase
      .from('protocollo_registro')
      .select('numero')
      .eq('registro', 'ordinario')
      .eq('anno', anno)
      .eq('tipo_flusso', tipo)
      .order('numero')
      .range(da, a)
  );
  if (righe.length === 0) return null;
  const presenti = new Set(righe.map((r) => r.numero));
  const max = Math.max(...presenti);
  const mancanti: number[] = [];
  for (let n = 1; n <= max; n++) if (!presenti.has(n)) mancanti.push(n);
  return mancanti.length > 0 ? { anno, tipo_flusso: tipo, numeri_mancanti: mancanti } : null;
}

export default function GestioneNumerazione() {
  const [sequenze, setSequenze] = useState<SequenzaNumerazione[]>([]);
  const [lacune, setLacune] = useState<LacunaInfo[]>([]);
  const [sequenzeContratti, setSequenzeContratti] = useState<{ anno: number; ultimo_numero: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [elaborando, setElaborando] = useState(false);
  const annoCorrente = new Date().getFullYear();

  const caricaDati = useCallback(async () => {
    setLoading(true);
    try {
      const [seq, seqContratti, ...lacuneAnno] = await Promise.all([
        supabase.from('protocollo_sequenze').select('registro, anno, tipo_flusso, ultimo_numero')
          .order('anno', { ascending: false }).order('registro').order('tipo_flusso'),
        supabase.from('protocollo_contratti_sequenze').select('anno, ultimo_numero')
          .order('anno', { ascending: false }),
        trovaLacune(annoCorrente, 'arrivo'),
        trovaLacune(annoCorrente, 'partenza'),
      ]);
      if (seq.error) throw seq.error;
      if (seqContratti.error) throw seqContratti.error;
      setSequenze((seq.data ?? []) as SequenzaNumerazione[]);
      setSequenzeContratti(seqContratti.data ?? []);
      setLacune(lacuneAnno.filter((l): l is LacunaInfo => l !== null));
    } catch (err) {
      console.error(err);
      toast.error('Errore durante il caricamento dei dati');
    } finally {
      setLoading(false);
    }
  }, [annoCorrente]);

  useEffect(() => {
    caricaDati();
  }, [caricaDati]);

  const rinumeraProgressivamente = async (anno: number, tipoFlusso: TipoFlusso) => {
    const label = ETICHETTA[tipoFlusso];
    if (!confirm(`Rinumerare progressivamente tutti i protocolli ${label} del ${anno}?\n\nQuesta operazione modifica i numeri di protocollo. I protocolli BLOCCATI mantengono il loro numero; gli altri ricevono, in ordine di data, i numeri liberi.`)) return;
    setElaborando(true);
    try {
      // Operazione atomica lato database (protocollo_rinumera, supabase/schema.sql):
      // ordina per data, assegna i numeri liberi, riallinea il contatore e registra
      // nello storico ogni numero cambiato. In caso di errore non cambia nulla.
      const { data: totale, error } = await supabase.rpc('protocollo_rinumera', {
        p_anno: anno,
        p_tipo_flusso: tipoFlusso,
      });
      if (error) throw error;
      if (!totale) toast.info('Nessun protocollo da rinumerare');
      else toast.success(`Rinumerazione ${label} completata: ${totale} protocolli non bloccati riordinati`);
      await caricaDati();
    } catch (err: unknown) {
      console.error(err);
      toast.error('Errore durante la rinumerazione: nessun numero è stato modificato. Riprova.');
    } finally {
      setElaborando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Numerazione</h1>
          <p className="mt-1 text-sm text-gray-500">
            {NOME_ENTE} — numerazione separata per Entrata (A/0001/{annoCorrente}) e Uscita
            (U/0001/{annoCorrente}). La rinumerazione non modifica i protocolli bloccati.
          </p>
        </div>
        <button
          onClick={caricaDati}
          disabled={loading || elaborando}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Aggiorna
        </button>
      </div>

      {/* Lacune */}
      {lacune.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800">Lacune rilevate nell'anno {annoCorrente}</p>
              <p className="mt-1 text-sm text-amber-700">
                Sono stati trovati numeri di protocollo mancanti nella sequenza progressiva.
              </p>
              <div className="mt-3 space-y-2">
                {lacune.map((l) => (
                  <div
                    key={`${l.anno}-${l.tipo_flusso}`}
                    className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-4 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {l.anno} —{' '}
                        <span className={l.tipo_flusso === 'arrivo' ? 'text-green-700' : 'text-orange-700'}>
                          {ETICHETTA[l.tipo_flusso]}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Mancanti: {l.numeri_mancanti.slice(0, 10).join(', ')}
                        {l.numeri_mancanti.length > 10 && ` ... (+${l.numeri_mancanti.length - 10})`}
                      </p>
                    </div>
                    <button
                      onClick={() => rinumeraProgressivamente(l.anno, l.tipo_flusso)}
                      disabled={elaborando}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {elaborando ? 'In corso...' : 'Rinumera'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contatori del protocollo */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003399]/10">
            <Hash size={16} className="text-[#003399]" />
          </div>
          <p className="font-semibold text-gray-900">Registro di protocollo</p>
        </div>
        {sequenze.length === 0 ? (
          <p className="border-t py-6 text-center text-sm text-gray-400">Nessun protocollo ancora registrato</p>
        ) : (
          <table className="w-full border-t text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left">Anno</th>
                <th className="px-5 py-3 text-left">Tipo</th>
                <th className="px-5 py-3 text-right">Ultimo numero</th>
                <th className="px-5 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sequenze.map((seq) => (
                <tr key={`${seq.registro}-${seq.anno}-${seq.tipo_flusso}`} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{seq.anno}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      seq.tipo_flusso === 'arrivo' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {seq.tipo_flusso === 'arrivo' ? <ArrowDownCircle size={11} /> : <ArrowUpCircle size={11} />}
                      {seq.registro === 'pec' ? 'PEC ' : ''}{ETICHETTA[seq.tipo_flusso]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-gray-700">
                    {formatNumeroCompleto(seq.anno, seq.ultimo_numero, seq.tipo_flusso, seq.registro)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {seq.registro === 'pec' ? (
                      <span className="text-xs text-gray-400" title="I protocolli PEC sono sempre bloccati">Non rinumerabile</span>
                    ) : (
                    <button
                      onClick={() => rinumeraProgressivamente(seq.anno, seq.tipo_flusso)}
                      disabled={elaborando}
                      className="rounded-lg border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Rinumera progressivamente
                    </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Repertorio contratti */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003399]/10">
            <ScrollText size={16} className="text-[#003399]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Repertorio Contratti</p>
            <p className="text-xs text-gray-500">
              Numerazione C/NNNN/ANNO, separata dal protocollo. I numeri di repertorio non vengono rinumerati.
            </p>
          </div>
        </div>
        {sequenzeContratti.length === 0 ? (
          <p className="border-t py-6 text-center text-sm text-gray-400">Nessun contratto ancora repertoriato</p>
        ) : (
          <table className="w-full border-t text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left">Anno</th>
                <th className="px-5 py-3 text-right">Ultimo numero</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sequenzeContratti.map((s) => (
                <tr key={s.anno}>
                  <td className="px-5 py-3 font-medium text-gray-900">{s.anno}</td>
                  <td className="px-5 py-3 text-right font-mono text-gray-700">
                    {formatNumeroContratto(s.anno, s.ultimo_numero)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
