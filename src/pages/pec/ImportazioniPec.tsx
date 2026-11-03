// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DownloadCloud, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getImportazioniPec, spiegaErroreImportazione } from '@/hooks/usePec';
import { formatData } from '@/lib/utils';
import type { ImportazionePec } from '@/types';

const ETICHETTA_STATO: Record<ImportazionePec['stato'], string> = {
  in_corso: 'In corso',
  completata: 'Completata',
  interrotta: 'Interrotta',
};

export default function ImportazioniPec() {
  const [importazioni, setImportazioni] = useState<ImportazionePec[]>([]);
  const [loading, setLoading] = useState(true);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setImportazioni(await getImportazioniPec());
    } catch (err: unknown) {
      console.error(err);
      toast.error('Errore nel caricamento delle importazioni');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <DownloadCloud className="h-6 w-6 text-[#003399]" />
            Importazioni PEC
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Elenco dei caricamenti eseguiti dal programma di acquisizione, che legge le PEC
            dalla casella e le porta qui con EML, PDF e allegati. Non assegna numeri: le PEC
            caricate vanno verificate e protocollate da{' '}
            <Link to="/pec/coda" className="text-[#003399] underline">PEC da protocollare</Link>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => carica()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Aggiorna
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
          </div>
        ) : importazioni.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Nessuna importazione eseguita</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Avviata</th>
                <th className="px-4 py-3 text-left">Stato</th>
                <th className="px-4 py-3 text-right">Righe indice</th>
                <th className="px-4 py-3 text-right">Nuove</th>
                <th className="px-4 py-3 text-right">Anomalie</th>
                <th className="px-4 py-3 text-right">Già presenti</th>
                <th className="px-4 py-3 text-left">Errore</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {importazioni.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatData(i.avviata_il, true)}</td>
                  <td className="px-4 py-2.5">{ETICHETTA_STATO[i.stato]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{i.righe_indice}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{i.nuove}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{i.anomalie}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{i.gia_presenti}</td>
                  <td className="px-4 py-2.5 text-xs text-red-700">{spiegaErroreImportazione(i.errore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
