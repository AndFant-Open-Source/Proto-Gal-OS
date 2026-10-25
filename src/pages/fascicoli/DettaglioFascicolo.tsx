// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Clock, Download, Edit2, FileSignature, FileText, FolderCheck, FolderOpen, Link2Off, Plus, Search, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FascicoloForm } from '@/components/FascicoloForm';
import { StatoFascicoloBadge } from '@/components/StatoFascicoloBadge';
import { useAuth } from '@/hooks/useAuth';
import {
  aggiornaFascicolo, cercaDocumenti, collegaDocumento, dataDocumento, eliminaFascicolo, getDocumentiFascicolo,
  getFascicolo, getLogFascicolo, messaggioErroreFascicolo, scollegaDocumento,
} from '@/hooks/useFascicoli';
import type { RiferimentoDocumento } from '@/hooks/useFascicoli';
import { creaZipFascicolo } from '@/lib/fascicoloZip';
import type { AvanzamentoZip } from '@/lib/fascicoloZip';
import { formatData, LABEL_FLUSSO } from '@/lib/utils';
import type { DocumentoFascicolo, Fascicolo, LogAzione } from '@/types';

type Risultati = Awaited<ReturnType<typeof cercaDocumenti>>;

function Dato({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{etichetta}</p>
      <div className="mt-0.5 text-sm text-gray-900">{children}</div>
    </div>
  );
}

export default function DettaglioFascicolo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isOperatore } = useAuth();
  const [fascicolo, setFascicolo] = useState<Fascicolo | null>(null);
  const [documenti, setDocumenti] = useState<DocumentoFascicolo[]>([]);
  const [log, setLog] = useState<LogAzione[]>([]);
  const [loading, setLoading] = useState(true);
  const [modifica, setModifica] = useState(false);
  const [confermaStato, setConfermaStato] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [daScollegare, setDaScollegare] = useState<DocumentoFascicolo | null>(null);
  const [lavorando, setLavorando] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [risultati, setRisultati] = useState<Risultati>({ protocolli: [], contratti: [] });
  const [cercando, setCercando] = useState(false);
  const [zip, setZip] = useState<AvanzamentoZip | null>(null);

  const ricaricaDocumenti = useCallback(async (fascicoloId: string) => {
    const [d, l] = await Promise.all([getDocumentiFascicolo(fascicoloId), getLogFascicolo(fascicoloId)]);
    setDocumenti(d);
    setLog(l);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getFascicolo(id), ricaricaDocumenti(id)])
      .then(([f]) => setFascicolo(f))
      .catch((err: unknown) => {
        console.error(err);
        toast.error('Errore nel caricamento del fascicolo');
      })
      .finally(() => setLoading(false));
  }, [id, ricaricaDocumenti]);

  // Ricerca dei documenti da aggiungere, dopo una breve pausa nella digitazione
  useEffect(() => {
    if (ricerca.trim().length < 2) {
      setRisultati({ protocolli: [], contratti: [] });
      return;
    }
    const attesa = setTimeout(() => {
      setCercando(true);
      cercaDocumenti(ricerca)
        .then(setRisultati)
        .catch((err: unknown) => {
          console.error(err);
          toast.error('Errore durante la ricerca');
        })
        .finally(() => setCercando(false));
    }, 300);
    return () => clearTimeout(attesa);
  }, [ricerca]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }
  if (!fascicolo) {
    return <p className="py-16 text-center text-sm text-gray-500">Fascicolo non trovato.</p>;
  }

  const aperto = fascicolo.stato === 'aperto';
  const modificabile = isOperatore && (aperto || isAdmin);
  const collegati = new Set(documenti.map((d) => d.protocollo_id ?? d.contratto_id));

  const aggiungi = async (rif: RiferimentoDocumento) => {
    setLavorando(true);
    try {
      await collegaDocumento(fascicolo.id, rif);
      await ricaricaDocumenti(fascicolo.id);
      toast.success('Documento aggiunto al fascicolo');
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante l\'aggiunta del documento'));
    } finally {
      setLavorando(false);
    }
  };

  const scollega = async () => {
    if (!daScollegare) return;
    setLavorando(true);
    try {
      await scollegaDocumento(daScollegare.id);
      await ricaricaDocumenti(fascicolo.id);
      toast.success('Documento tolto dal fascicolo');
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante la rimozione del documento'));
    } finally {
      setDaScollegare(null);
      setLavorando(false);
    }
  };

  const cambiaStato = async () => {
    setLavorando(true);
    try {
      const aggiornato = await aggiornaFascicolo(fascicolo.id, { stato: aperto ? 'chiuso' : 'aperto' });
      setFascicolo(aggiornato);
      await ricaricaDocumenti(fascicolo.id);
      toast.success(aperto ? 'Fascicolo chiuso' : 'Fascicolo riaperto');
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante il cambio di stato'));
    } finally {
      setConfermaStato(false);
      setLavorando(false);
    }
  };

  const elimina = async () => {
    setLavorando(true);
    try {
      await eliminaFascicolo(fascicolo.id);
      toast.success(`Fascicolo ${fascicolo.numero_completo} eliminato`);
      navigate('/fascicoli');
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante l\'eliminazione del fascicolo'));
      setLavorando(false);
      setConfermaElimina(false);
    }
  };

  const scaricaZip = async () => {
    setZip({ fatto: 0, totale: 0 });
    try {
      const { zip: file, nonInclusi } = await creaZipFascicolo(fascicolo, documenti, setZip);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Fascicolo_${fascicolo.numero_completo.replace(/\//g, '-')}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (nonInclusi.length) toast.warning(`Fascicolo scaricato; ${nonInclusi.length} file non trovati nell'archivio`);
      else toast.success('Fascicolo scaricato');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Errore durante la preparazione del fascicolo. Riprova.');
    } finally {
      setZip(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-5 pb-8 [overflow-wrap:anywhere]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/fascicoli')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Fascicoli
        </Button>
        <div className="min-w-[14rem] flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="whitespace-nowrap font-mono text-2xl font-bold text-[#003399]">{fascicolo.numero_completo}</h1>
            <StatoFascicoloBadge stato={fascicolo.stato} />
          </div>
          <p className="text-sm text-gray-700">{fascicolo.oggetto}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={scaricaZip} disabled={!!zip || documenti.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {zip ? (zip.totale ? `Preparazione ${zip.fatto}/${zip.totale}…` : 'Preparazione…') : 'Scarica fascicolo'}
          </Button>
          {modificabile && (
            <Button variant="outline" size="sm" onClick={() => setModifica(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Modifica
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={() => setConfermaStato(true)} disabled={lavorando}
              className={aperto ? 'bg-gray-700 hover:bg-gray-800' : 'bg-green-700 hover:bg-green-800'}>
              {aperto ? <FolderCheck className="mr-2 h-4 w-4" /> : <FolderOpen className="mr-2 h-4 w-4" />}
              {aperto ? 'Chiudi fascicolo' : 'Riapri fascicolo'}
            </Button>
          )}
          {isAdmin && documenti.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => setConfermaElimina(true)} disabled={lavorando}
              className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50">
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </Button>
          )}
        </div>
      </div>

      {!aperto && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          Fascicolo chiuso il {formatData(fascicolo.data_chiusura ?? undefined)}: non si possono aggiungere né togliere documenti.
          {isAdmin ? ' Puoi riaprirlo se necessario.' : ' Solo un amministratore può riaprirlo.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {/* Documenti */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documenti ({documenti.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {documenti.length === 0 ? (
                <p className="text-sm text-gray-400">Nessun documento nel fascicolo</p>
              ) : (
                <ol className="divide-y divide-gray-100 rounded-lg border">
                  {documenti.map((d) => {
                    const p = d.protocollo;
                    const c = d.contratto;
                    const percorso = p ? `/protocollo/${p.id}` : c ? `/contratti/${c.id}` : null;
                    return (
                      <li key={d.id} className="flex items-start gap-3 px-3 py-2.5">
                        {p ? <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#003399]" />
                          : <FileSignature className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-700" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {percorso ? (
                              <Link to={percorso} className="font-mono text-sm font-semibold text-[#003399] hover:underline">
                                {p?.numero_completo ?? c?.numero_completo}
                              </Link>
                            ) : <span className="text-sm text-gray-400">Documento non disponibile</span>}
                            <span className="text-xs text-gray-500">{formatData(dataDocumento(d), true)}</span>
                            <span className="text-xs text-gray-500">
                              {p ? `Protocollo ${LABEL_FLUSSO[p.tipo_flusso].toLowerCase()}` : 'Contratto'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-800">{p?.oggetto ?? c?.oggetto}</p>
                          <p className="text-xs text-gray-500">
                            {p ? (p.tipo_flusso === 'arrivo' ? p.mittente_nome : p.destinatario_nome) : c?.contraente_nome}
                          </p>
                        </div>
                        {isOperatore && aperto && (
                          <Button variant="ghost" size="sm" title="Togli dal fascicolo" aria-label="Togli dal fascicolo"
                            onClick={() => setDaScollegare(d)} disabled={lavorando}>
                            <Link2Off className="h-4 w-4 text-gray-500" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {isOperatore && aperto && (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Plus className="h-4 w-4" />
                    Aggiungi un documento
                  </p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <Input className="pl-8" value={ricerca} onChange={(e) => setRicerca(e.target.value)}
                      placeholder="Numero (es. A/0015), oggetto, mittente o contraente" />
                  </div>
                  {cercando && <p className="text-xs text-gray-500">Ricerca in corso…</p>}
                  {!cercando && ricerca.trim().length >= 2 && risultati.protocolli.length + risultati.contratti.length === 0 && (
                    <p className="text-xs text-gray-500">Nessun documento trovato</p>
                  )}
                  <ul className="divide-y divide-gray-100">
                    {[
                      ...risultati.protocolli.map((r) => ({ id: r.id, numero: r.numero_completo, oggetto: r.oggetto, data: r.data_registrazione, rif: { protocollo_id: r.id } as RiferimentoDocumento })),
                      ...risultati.contratti.map((r) => ({ id: r.id, numero: r.numero_completo, oggetto: r.oggetto, data: r.data_repertorio, rif: { contratto_id: r.id } as RiferimentoDocumento })),
                    ].map((r) => (
                      <li key={r.id} className="flex items-center gap-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-sm font-semibold text-gray-800">{r.numero}</span>
                          <span className="ml-2 text-xs text-gray-500">{formatData(r.data)}</span>
                          <p className="truncate text-xs text-gray-600">{r.oggetto}</p>
                        </div>
                        <Button size="sm" variant="outline" disabled={lavorando || collegati.has(r.id)} onClick={() => aggiungi(r.rif)}>
                          {collegati.has(r.id) ? 'Già presente' : 'Aggiungi'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dati del fascicolo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Dato etichetta="Classificazione">
                {fascicolo.titolario ? `${fascicolo.titolario.codice} — ${fascicolo.titolario.descrizione}` : '—'}
              </Dato>
              <Dato etichetta="Responsabile">{fascicolo.responsabile ?? '—'}</Dato>
              <Dato etichetta="Ufficio">{fascicolo.ufficio ?? '—'}</Dato>
              <Dato etichetta="Apertura">{formatData(fascicolo.data_apertura)}</Dato>
              {fascicolo.data_chiusura && <Dato etichetta="Chiusura">{formatData(fascicolo.data_chiusura)}</Dato>}
              <Dato etichetta="Riferimento esterno">{fascicolo.riferimento_esterno ?? '—'}</Dato>
              {fascicolo.note && <Dato etichetta="Note"><p className="whitespace-pre-wrap">{fascicolo.note}</p></Dato>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Storico Azioni
              </CardTitle>
            </CardHeader>
            <CardContent>
              {log.length === 0 ? (
                <p className="text-sm text-gray-400">Nessuna azione registrata</p>
              ) : (
                <ol className="relative space-y-4 border-l-2 border-gray-100 pl-5">
                  {log.map((azione) => (
                    <li key={azione.id} className="relative">
                      <span className="absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-[#003399]" />
                      <p className="text-xs font-semibold text-gray-700">
                        {azione.azione.replace(/^FASCICOLO_/, '').replace(/_/g, ' ')}
                        {azione.numero_completo_rif && azione.numero_completo_rif !== fascicolo.numero_completo && ` ${azione.numero_completo_rif}`}
                      </p>
                      {azione.azione === 'FASCICOLO_MODIFICA' && azione.dettaglio && (
                        <p className="mt-0.5 text-xs text-gray-500">Campi: {Object.keys(azione.dettaglio).join(', ')}</p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-400">
                        {formatData(azione.created_at, true)}{azione.profilo ? ` — ${azione.profilo.nome_completo}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <FascicoloForm
        aperto={modifica}
        fascicolo={fascicolo}
        onChiudi={() => setModifica(false)}
        onSalvato={(f) => {
          setFascicolo(f);
          setModifica(false);
          void ricaricaDocumenti(f.id);
        }}
      />

      <AlertDialog open={confermaStato} onOpenChange={setConfermaStato}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{aperto ? 'Chiudere il fascicolo?' : 'Riaprire il fascicolo?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {aperto
                ? `Dopo la chiusura non si potranno aggiungere né togliere documenti da ${fascicolo.numero_completo}. Solo un amministratore potrà riaprirlo.`
                : `${fascicolo.numero_completo} tornerà modificabile dagli operatori.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void cambiaStato(); }}>{aperto ? 'Chiudi' : 'Riapri'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confermaElimina} onOpenChange={setConfermaElimina}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il fascicolo?</AlertDialogTitle>
            <AlertDialogDescription>
              Il fascicolo vuoto {fascicolo.numero_completo} verrà eliminato definitivamente. Il suo numero non
              verrà riassegnato; l'eliminazione resta nello storico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { void elimina(); }}>
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!daScollegare} onOpenChange={(v) => { if (!v) setDaScollegare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere il documento dal fascicolo?</AlertDialogTitle>
            <AlertDialogDescription>
              {daScollegare?.protocollo?.numero_completo ?? daScollegare?.contratto?.numero_completo} non verrà
              modificato né eliminato: viene solo tolto da questo fascicolo. L'operazione resta nello storico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void scollega(); }}>Togli dal fascicolo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
