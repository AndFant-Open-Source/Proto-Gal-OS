// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DownloadCloud, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { chiamaImportazione, ErroreImportazionePec, getImportazioniPec, spiegaErroreImportazione } from '@/hooks/usePec';
import { formatData } from '@/lib/utils';
import type { ImportazionePec } from '@/types';

const ETICHETTA_STATO: Record<ImportazionePec['stato'], string> = {
  in_corso: 'In corso',
  completata: 'Completata',
  interrotta: 'Interrotta',
};

export default function ImportazioniPec() {
  const { isOperatore } = useAuth();
  const [importazioni, setImportazioni] = useState<ImportazionePec[]>([]);
  const [loading, setLoading] = useState(true);
  const [avanzamento, setAvanzamento] = useState<{ fatte: number; rimanenti: number } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

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

  const importa = async () => {
    setErrore(null);
    // Riprende un'importazione rimasta a metà (es. pagina chiusa) invece di aprirne un'altra
    const recente = importazioni.find((i) => i.stato === 'in_corso'
      && Date.now() - new Date(i.avviata_il).getTime() < 30 * 60_000);
    let id: string | null = recente?.id ?? null;
    let fatte = 0;
    let nuove = 0;
    let anomalie = 0;
    setAvanzamento({ fatte: 0, rimanenti: 0 });
    try {
      // La funzione lavora a blocchi: si richiama finché non restano righe
      for (;;) {
        const esito = await chiamaImportazione(id);
        id = esito.importazione_id;
        fatte += esito.importate_ora;
        nuove += esito.nuove;
        anomalie += esito.anomalie;
        setAvanzamento({ fatte, rimanenti: esito.rimanenti });
        if (esito.completata || esito.importate_ora === 0) break;
      }
      if (fatte === 0) toast.info('Nessuna PEC nuova nel foglio');
      else toast.success(`${fatte} PEC importate: ${nuove} da verificare, ${anomalie} con anomalie`);
    } catch (err: unknown) {
      console.error(err);
      const messaggio = err instanceof ErroreImportazionePec ? err.message : 'Importazione interrotta per un errore imprevisto: riprovare.';
      setErrore(messaggio);
      toast.error(fatte ? `Importazione interrotta dopo ${fatte} PEC: rilanciarla riprende da dove si è fermata.` : messaggio);
    } finally {
      setAvanzamento(null);
      await carica();
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <DownloadCloud className="h-6 w-6 text-[#003399]" />
            Importazioni PEC
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Legge il foglio GAL_Indice_PEC e copia nel protocollo EML, PDF e allegati delle PEC nuove da Google Drive.
            Non assegna numeri: le PEC importate vanno verificate e protocollate da{' '}
            <Link to="/pec/coda" className="text-[#003399] underline">PEC da protocollare</Link>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => carica()} disabled={loading || !!avanzamento}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Aggiorna
        </Button>
        {isOperatore && (
          <Button onClick={importa} disabled={!!avanzamento} className="bg-[#003399] hover:bg-[#002277]">
            <DownloadCloud className="mr-2 h-4 w-4" />
            {avanzamento ? 'Importazione in corso…' : 'Importa da Google Drive'}
          </Button>
        )}
      </div>

      {avanzamento && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#003399] border-t-transparent" />
          {avanzamento.fatte} PEC importate{avanzamento.rimanenti ? `, ${avanzamento.rimanenti} ancora da importare` : ''}.
          Non chiudere la pagina fino al termine.
        </div>
      )}
      {errore && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errore}</div>
      )}

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
