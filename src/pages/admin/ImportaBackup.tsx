// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileArchive, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { NOME_ENTE } from '@/lib/ente';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ErroreBackup,
  importaBackup,
  leggiBackup,
  proponiMappa,
  trovaConflitti,
} from '@/lib/backup';
import type { Avanzamento, BackupLetto, EsitoImportazione, MappaUtenti } from '@/lib/backup';

interface Persona {
  id: string;
  nome_completo: string;
  ruolo: string;
}

export default function ImportaBackup() {
  const [persone, setPersone] = useState<Persona[]>([]);
  const [letto, setLetto] = useState<BackupLetto | null>(null);
  const [mappa, setMappa] = useState<MappaUtenti>({});
  const [conflitti, setConflitti] = useState<string[]>([]);
  const [lettura, setLettura] = useState(false);
  const [conferma, setConferma] = useState(false);
  const [avanzamento, setAvanzamento] = useState<Avanzamento | null>(null);
  const [esito, setEsito] = useState<EsitoImportazione | null>(null);

  useEffect(() => {
    supabase.from('protocollo_profili').select('id, nome_completo, ruolo').order('nome_completo')
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          toast.error('Impossibile leggere l\'elenco delle persone');
          return;
        }
        setPersone(data ?? []);
      });
  }, []);

  const scegliFile = async (file: File | undefined) => {
    if (!file) return;
    setLetto(null);
    setEsito(null);
    setConflitti([]);
    setLettura(true);
    try {
      const nuovo = await leggiBackup(file);
      setConflitti(await trovaConflitti(nuovo.backup));
      setMappa(proponiMappa(nuovo.backup.utenti, persone));
      setLetto(nuovo);
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof ErroreBackup ? err.message : 'Impossibile leggere il backup. Riprova.');
    } finally {
      setLettura(false);
    }
  };

  const avvia = async () => {
    if (!letto) return;
    setConferma(false);
    setAvanzamento({ fase: 'Avvio', fatto: 0, totale: 0 });
    try {
      const risultato = await importaBackup(letto, mappa, setAvanzamento);
      setEsito(risultato);
      toast.success('Importazione completata');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Importazione interrotta. I dati già copiati restano; puoi ripetere l\'importazione con lo stesso file: le righe presenti vengono saltate.');
    } finally {
      setAvanzamento(null);
    }
  };

  const backup = letto?.backup;
  const numeroFile = letto ? Object.keys(letto.file).filter((k) => k.startsWith('file/')).length : 0;
  const percentuale = avanzamento && avanzamento.totale > 0
    ? Math.round((avanzamento.fatto / avanzamento.totale) * 100)
    : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <FileArchive className="h-6 w-6 text-[#003399]" />
          Importa backup
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Carica in {NOME_ENTE} un backup creato con la funzione «Backup dati» di Proto Gal: protocolli,
          allegati, contratti e storico mantengono numeri, date e autori originali.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <label className="block text-sm font-medium text-gray-700" htmlFor="file-backup">File di backup (.zip)</label>
        <input
          id="file-backup"
          type="file"
          accept=".zip,application/zip"
          disabled={lettura || !!avanzamento}
          onChange={(e) => { void scegliFile(e.target.files?.[0]); e.target.value = ''; }}
          className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-[#003399] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#002277]"
        />
        {lettura && (
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#003399] border-t-transparent" />
            Lettura e controllo del backup…
          </p>
        )}
      </div>

      {backup && !esito && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">{backup.ente.nome}</p>
            <p className="text-xs text-gray-500">
              Backup del {new Date(backup.creato_il).toLocaleString('it-IT')}
            </p>
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              <li>Protocolli: {backup.protocolli.length}</li>
              <li>Allegati protocolli: {backup.allegati_protocolli.length}</li>
              <li>Contratti: {backup.contratti.length}</li>
              <li>Allegati contratti: {backup.allegati_contratti.length}</li>
              <li>Righe di storico: {backup.storico.length}</li>
              <li>File nel backup: {numeroFile}</li>
            </ul>
          </div>

          {backup.utenti.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="px-5 py-4">
                <p className="font-semibold text-gray-900">Persone</p>
                <p className="text-xs text-gray-500">
                  Indica a chi corrisponde, in questa piattaforma, ogni persona citata nel backup («ha registrato»,
                  «ha bloccato», storico). Se scegli «Nessuno» il dato resta vuoto.
                </p>
              </div>
              <table className="w-full border-t text-sm">
                <tbody className="divide-y divide-gray-100">
                  {backup.utenti.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-2">
                        <p className="font-medium text-gray-900">{u.nome_completo || 'Senza nome'}</p>
                        <p className="text-xs capitalize text-gray-500">{u.ruolo}</p>
                      </td>
                      <td className="px-5 py-2 text-right">
                        <select
                          aria-label={`Persona corrispondente a ${u.nome_completo}`}
                          value={mappa[u.id] ?? ''}
                          onChange={(e) => setMappa({ ...mappa, [u.id]: e.target.value })}
                          disabled={!!avanzamento}
                          className="w-full max-w-xs rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Nessuno</option>
                          {persone.map((p) => <option key={p.id} value={p.id}>{p.nome_completo}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {conflitti.length > 0 ? (
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Importazione non possibile</p>
                <p className="mt-1">
                  In questa piattaforma esistono già {conflitti.length} registrazioni con gli stessi numeri del backup
                  (di solito sono prove). Eliminale e ricarica il file:
                </p>
                <p className="mt-1 font-mono text-xs">
                  {conflitti.slice(0, 15).join(', ')}{conflitti.length > 15 && ` … (+${conflitti.length - 15})`}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
              <Button onClick={() => setConferma(true)} disabled={!!avanzamento} className="bg-[#003399] hover:bg-[#002277]">
                <Upload className="mr-2 h-4 w-4" />
                {avanzamento ? 'Importazione in corso…' : 'Importa'}
              </Button>
              {avanzamento && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#003399] border-t-transparent" />
                    {avanzamento.fase}
                    {percentuale !== null && ` — ${avanzamento.fatto} di ${avanzamento.totale}`}
                  </p>
                  {percentuale !== null && (
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full bg-[#003399] transition-all" style={{ width: `${percentuale}%` }} />
                    </div>
                  )}
                  <p className="text-xs text-gray-400">Non chiudere la pagina fino al termine.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {esito && (
        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-5 w-5" />
            Importazione completata
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>Protocolli aggiunti: {esito.righe.protocolli ?? 0}</li>
            <li>Allegati protocolli: {esito.righe.allegati_protocolli ?? 0}</li>
            <li>Contratti aggiunti: {esito.righe.contratti ?? 0}</li>
            <li>Allegati contratti: {esito.righe.allegati_contratti ?? 0}</li>
            <li>Righe di storico: {esito.righe.storico ?? 0}</li>
            <li>File caricati: {esito.fileCopiati}{esito.fileGiaPresenti > 0 && ` (+${esito.fileGiaPresenti} già presenti)`}</li>
          </ul>
          <p className="text-xs">Righe già presenti (stesso identificativo) sono state saltate. La numerazione è stata allineata.</p>
          {esito.fileNonCopiati.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <div>
                {esito.fileNonCopiati.length} file non caricati:
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {esito.fileNonCopiati.slice(0, 20).map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importare il backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno aggiunti a {NOME_ENTE} {backup?.protocolli.length ?? 0} protocolli e {backup?.contratti.length ?? 0} contratti
              con i loro allegati. I dati già presenti non vengono modificati. Le registrazioni importate
              potranno poi essere eliminate solo una per una.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void avvia(); }} className="bg-[#003399] hover:bg-[#002277]">
              Importa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
