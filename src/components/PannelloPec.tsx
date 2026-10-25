// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { Download, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { comeFileArchiviato, getPecDelProtocollo, spiegaSegnalazione } from '@/hooks/usePec';
import { downloadAllegato } from '@/hooks/useProtocolli';
import { formatData } from '@/lib/utils';
import type { MessaggioPec, Protocollo } from '@/types';

const TIPO_RICEVUTA: Record<string, string> = {
  'accettazione': 'Accettazione',
  'non-accettazione': 'Non accettazione',
  'presa-in-carico': 'Presa in carico',
  'avvenuta-consegna': 'Avvenuta consegna',
  'posta-certificata': 'Posta certificata',
  'errore-consegna': 'Mancata consegna',
  'preavviso-errore-consegna': 'Preavviso di mancata consegna',
  'rilevazione-virus': 'Rilevazione virus',
};
const ESITO_NEGATIVO = new Set(['non-accettazione', 'errore-consegna', 'preavviso-errore-consegna', 'rilevazione-virus']);

function Riga({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{etichetta}</dt>
      <dd className="break-all text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/** Dati della PEC di origine e ricevute, nel dettaglio di un protocollo della serie PEC */
export function PannelloPec({ protocollo }: { protocollo: Protocollo }) {
  const [messaggio, setMessaggio] = useState<MessaggioPec | null>(null);
  const [ricevute, setRicevute] = useState<MessaggioPec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPecDelProtocollo(protocollo.id)
      .then(({ messaggio: m, ricevute: r }) => { setMessaggio(m); setRicevute(r); })
      .catch((err: unknown) => {
        console.error(err);
        toast.error('Errore nel caricamento dei dati della PEC');
      })
      .finally(() => setLoading(false));
  }, [protocollo.id]);

  const scaricaEml = async (m: MessaggioPec) => {
    const eml = m.protocollo_pec_file?.find((f) => f.ruolo === 'eml');
    if (!eml) return;
    try {
      await downloadAllegato(comeFileArchiviato(eml));
    } catch {
      toast.error('File non disponibile');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-4 w-4 text-purple-700" />
          PEC di origine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">Caricamento…</p>
        ) : !messaggio ? (
          <p className="text-sm text-gray-400">Dati della PEC non disponibili</p>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Riga etichetta="Data della PEC (data di protocollo)">
                {formatData(messaggio.data_pec ?? undefined, true)}{' '}
                <span className={messaggio.data_certificata ? 'text-green-700' : 'text-amber-700'}>
                  {messaggio.data_certificata ? '— certificata' : '— data dell\'email, non certificata'}
                </span>
              </Riga>
              <Riga etichetta="Protocollata il">{formatData(protocollo.created_at, true)}</Riga>
              <Riga etichetta="Importata il">{formatData(messaggio.importato_il, true)}</Riga>
              <Riga etichetta="ID acquisizione"><span className="font-mono text-xs">{messaggio.id_acquisizione}</span></Riga>
              {messaggio.cc && <Riga etichetta="Cc">{messaggio.cc}</Riga>}
              {messaggio.message_id && <Riga etichetta="Message-ID"><span className="font-mono text-xs">{messaggio.message_id}</span></Riga>}
              {messaggio.sha256_eml && <Riga etichetta="SHA-256 dell'EML"><span className="font-mono text-xs">{messaggio.sha256_eml}</span></Riga>}
            </dl>

            {messaggio.avvisi.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-900">
                {messaggio.avvisi.map((a) => <li key={a} className="rounded bg-amber-50 px-2 py-1">{spiegaSegnalazione(a)}</li>)}
              </ul>
            )}

            {protocollo.tipo_flusso === 'partenza' && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Ricevute</p>
                {ricevute.length === 0 ? (
                  <p className="text-sm text-gray-400">Nessuna ricevuta importata</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {ricevute.map((r) => {
                      const tipo = r.tipo_certificazione ?? '';
                      return (
                        <li key={r.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                          <span className={`min-w-0 flex-1 ${ESITO_NEGATIVO.has(tipo) ? 'font-medium text-red-700' : 'text-gray-800'}`}>
                            {TIPO_RICEVUTA[tipo] ?? (tipo || 'Ricevuta')}
                          </span>
                          <span className="text-xs text-gray-500">{formatData(r.data_pec ?? undefined, true)}</span>
                          <Button variant="ghost" size="sm" title="Scarica la ricevuta (EML)" onClick={() => scaricaEml(r)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
