// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Printer, Edit2, Trash2, Hash, Paperclip, FileText, Stamp, Eye, Download, Clock, Link, Upload,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AllegatiUpload } from '@/components/AllegatiUpload';
import { useAuth } from '@/hooks/useAuth';
import { NOME_ENTE } from '@/lib/ente';
import {
  getContratto, aggiornaContratto, eliminaContratto, caricaAllegatoContratto,
  eliminaAllegatoContratto, logAzioneContratto, getLogContratto,
} from '@/hooks/useContratti';
import { downloadAllegato, visualizzaAllegato, downloadAllegatoStampigliato } from '@/hooks/useProtocolli';
import {
  formatData, formatBytes, formatImporto, dataConFusoLocale, LABEL_TIPO_CONTRATTO, LABEL_FORMA_STIPULA,
  LABEL_STATO_CONTRATTO, COLORE_STATO_CONTRATTO,
} from '@/lib/utils';
import { toast } from 'sonner';
import type { Contratto, AllegatoContratto, LogAzione, StatoContratto } from '@/types';


function Dato({ etichetta, children, largo }: { etichetta: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={largo ? 'col-span-2' : undefined}>
      <dt className="text-xs font-medium text-gray-500">{etichetta}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export default function DettaglioContratto() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, isOperatore } = useAuth();
  const [contratto, setContratto] = useState<Contratto | null>(null);
  const [log, setLog] = useState<LogAzione[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuoviFiles, setNuoviFiles] = useState<File[]>([]);
  const [caricandoFile, setCaricandoFile] = useState(false);
  const [aggiornandoStato, setAggiornandoStato] = useState(false);
  const [modaleNumero, setModaleNumero] = useState(false);
  const [nuovoNumero, setNuovoNumero] = useState('');
  const [nuovaData, setNuovaData] = useState('');
  const [salvandoNumero, setSalvandoNumero] = useState(false);

  const ricarica = async (contrattoId: string) => {
    const [c, l] = await Promise.all([getContratto(contrattoId), getLogContratto(contrattoId)]);
    setContratto(c);
    setLog(l);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    ricarica(id)
      .catch(() => toast.error('Contratto non trovato o non accessibile'))
      .finally(() => setLoading(false));
  }, [id]);


  // ── Stato ─────────────────────────────────────────────────────────────────
  const cambiaStato = async (stato: StatoContratto) => {
    if (!contratto || !user) return;
    setAggiornandoStato(true);
    try {
      await aggiornaContratto(contratto.id, { stato });
      await logAzioneContratto(contratto.id, user.id, 'MODIFICA_STATO', {
        vecchio_stato: LABEL_STATO_CONTRATTO[contratto.stato], nuovo_stato: LABEL_STATO_CONTRATTO[stato],
      });
      await ricarica(contratto.id);
      toast.success(`Stato aggiornato a: ${LABEL_STATO_CONTRATTO[stato]}`);
    } catch {
      toast.error('Errore durante l\'aggiornamento dello stato');
    } finally {
      setAggiornandoStato(false);
    }
  };

  // ── Numero e data di repertorio (solo admin) ──────────────────────────────
  const apriModaleNumero = () => {
    if (!contratto) return;
    setNuovoNumero(String(contratto.numero));
    setNuovaData(format(parseISO(contratto.data_repertorio), "yyyy-MM-dd'T'HH:mm"));
    setModaleNumero(true);
  };

  const salvaNumeroData = async () => {
    if (!contratto || !user) return;
    const n = parseInt(nuovoNumero, 10);
    if (isNaN(n) || n < 1) { toast.error('Inserisci un numero valido'); return; }
    const data = new Date(nuovaData);
    if (!nuovaData || isNaN(data.getTime())) { toast.error('Inserisci una data valida'); return; }
    if (data.getFullYear() !== contratto.anno) {
      toast.error(`La data deve appartenere all'anno di repertorio ${contratto.anno}`);
      return;
    }
    if (data.getTime() > Date.now()) { toast.error('La data di repertorio non può essere nel futuro'); return; }

    const numeroCambiato = n !== contratto.numero;
    const dataCambiata = data.getTime() !== parseISO(contratto.data_repertorio).getTime();
    if (!numeroCambiato && !dataCambiata) { setModaleNumero(false); return; }

    setSalvandoNumero(true);
    try {
      const aggiornato = await aggiornaContratto(contratto.id, {
        ...(numeroCambiato && { numero: n }),
        ...(dataCambiata && { data_repertorio: dataConFusoLocale(data) }),
      });
      if (numeroCambiato) {
        await logAzioneContratto(contratto.id, user.id, 'MODIFICA_NUMERO', {
          vecchio_numero: contratto.numero_completo, nuovo_numero: aggiornato.numero_completo,
        });
      }
      if (dataCambiata) {
        await logAzioneContratto(contratto.id, user.id, 'MODIFICA_DATA_REPERTORIO', {
          vecchia_data: formatData(contratto.data_repertorio, true),
          nuova_data: formatData(aggiornato.data_repertorio, true),
        });
      }
      await ricarica(contratto.id);
      setModaleNumero(false);
      toast.success('Contratto aggiornato');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(/duplicate key|23505/i.test(msg)
        ? `Il numero ${n} è già assegnato a un altro contratto del ${contratto.anno}`
        : 'Errore durante la modifica del numero o della data');
    } finally {
      setSalvandoNumero(false);
    }
  };

  // ── Eliminazione (solo admin) ─────────────────────────────────────────────
  const handleElimina = async () => {
    if (!contratto) return;
    try {
      // L'eliminazione viene registrata nello storico dal database (trigger)
      await eliminaContratto(contratto);
      toast.success(`Contratto ${contratto.numero_completo} eliminato`);
      navigate('/contratti');
    } catch {
      toast.error('Errore durante l\'eliminazione del contratto');
    }
  };

  // ── Allegati ──────────────────────────────────────────────────────────────
  const caricaNuoviFile = async () => {
    if (!contratto || !user || nuoviFiles.length === 0) return;
    setCaricandoFile(true);
    const esiti = await Promise.allSettled(nuoviFiles.map((f) => caricaAllegatoContratto(contratto.id, f, user.id)));
    const caricati = nuoviFiles.filter((_, i) => esiti[i].status === 'fulfilled');
    const nonCaricati = nuoviFiles.filter((_, i) => esiti[i].status === 'rejected');
    if (caricati.length > 0) {
      await logAzioneContratto(contratto.id, user.id, 'AGGIUNTA_ALLEGATI', {
        file: caricati.map((f) => f.name).join(', '),
      });
      toast.success(caricati.length === 1 ? 'Allegato caricato' : `${caricati.length} allegati caricati`);
    }
    if (nonCaricati.length > 0) {
      toast.error(`Non è stato possibile caricare: ${nonCaricati.map((f) => f.name).join(', ')}. Riprova.`);
    }
    setNuoviFiles(nonCaricati);
    await ricarica(contratto.id).catch(() => undefined);
    setCaricandoFile(false);
  };

  const handleEliminaAllegato = async (a: AllegatoContratto) => {
    if (!contratto || !user) return;
    try {
      await eliminaAllegatoContratto(a);
      await logAzioneContratto(contratto.id, user.id, 'ELIMINA_ALLEGATO', { nome_file: a.nome_file });
      await ricarica(contratto.id);
      toast.success('Allegato eliminato');
    } catch {
      toast.error('Errore durante l\'eliminazione dell\'allegato');
    }
  };

  const conErrore = (azione: () => Promise<void>, messaggio: string) => async () => {
    try { await azione(); } catch { toast.error(messaggio); }
  };

  // ── Scheda PDF ────────────────────────────────────────────────────────────
  const stampaScheda = () => {
    if (!contratto) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.setTextColor(0, 51, 153);
    doc.text(NOME_ENTE, 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(50);
    doc.text('REPERTORIO CONTRATTI — SCHEDA', 14, 26);
    doc.setFontSize(18);
    doc.setTextColor(0, 51, 153);
    doc.text(contratto.numero_completo, 14, 36);
    autoTable(doc, {
      startY: 42,
      body: [
        ['Data di repertorio', formatData(contratto.data_repertorio)],
        ['Data di stipula', contratto.data_stipula ? formatData(contratto.data_stipula) : '—'],
        ['Tipologia', LABEL_TIPO_CONTRATTO[contratto.tipo_contratto]],
        ['Forma di stipula', contratto.forma_stipula ? LABEL_FORMA_STIPULA[contratto.forma_stipula] : '—'],
        ['Oggetto', contratto.oggetto],
        ['Contraente', contratto.contraente_nome],
        ['CF / P.IVA', contratto.contraente_codice_fiscale ?? '—'],
        ['PEC', contratto.contraente_pec ?? '—'],
        ['Importo (IVA esclusa)', formatImporto(contratto.importo)],
        ['CIG', contratto.cig ?? '—'],
        ['CUP', contratto.cup ?? '—'],
        ['Durata', `${contratto.data_inizio ? formatData(contratto.data_inizio) : '—'} → ${contratto.data_fine ? formatData(contratto.data_fine) : '—'}`],
        ['Stato', LABEL_STATO_CONTRATTO[contratto.stato]],
        ['Protocollo collegato', contratto.protocollo_collegato ?? '—'],
        ['Note', contratto.note ?? '—'],
      ],
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    });
    doc.save(`repertorio_${contratto.numero_completo.replace(/\//g, '-')}.pdf`);
    toast.success('PDF generato');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }

  if (!contratto) {
    return (
      <div className="py-24 text-center">
        <p className="text-gray-500">Contratto non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/contratti')}>
          Torna al repertorio
        </Button>
      </div>
    );
  }

  const allegati = contratto.protocollo_contratti_allegati ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-5 pb-8 [overflow-wrap:anywhere]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Indietro
        </Button>
        <div className="min-w-[14rem] flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="whitespace-nowrap font-mono text-2xl font-bold text-[#003399]">{contratto.numero_completo}</h1>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${COLORE_STATO_CONTRATTO[contratto.stato]}`}>
              {LABEL_STATO_CONTRATTO[contratto.stato]}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Repertorio Contratti — iscritto il {formatData(contratto.data_repertorio, true)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={stampaScheda}>
            <Printer className="mr-2 h-4 w-4" />
            Stampa
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={apriModaleNumero}>
              <Hash className="mr-2 h-4 w-4" />
              Modifica numero / data
            </Button>
          )}
          {isOperatore && (
            <Button size="sm" onClick={() => navigate(`/contratti/${contratto.id}/modifica`)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Modifica
            </Button>
          )}
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare il contratto?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Stai per eliminare definitivamente il contratto <strong>{contratto.numero_completo}</strong> — "{contratto.oggetto}".
                    L'operazione è <strong>irreversibile</strong>, rimuove anche gli allegati e lascia vacante il numero di repertorio.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleElimina}>
                    Sì, elimina definitivamente
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Colonna principale */}
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Dati del Contratto</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <Dato etichetta="Tipologia">{LABEL_TIPO_CONTRATTO[contratto.tipo_contratto]}</Dato>
                <Dato etichetta="Forma di stipula">{contratto.forma_stipula ? LABEL_FORMA_STIPULA[contratto.forma_stipula] : '—'}</Dato>
                <Dato etichetta="Data di stipula">{contratto.data_stipula ? formatData(contratto.data_stipula) : '—'}</Dato>
                <Dato etichetta="Data di repertorio">{formatData(contratto.data_repertorio)}</Dato>
                <Dato etichetta="Oggetto" largo><span className="font-medium">{contratto.oggetto}</span></Dato>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Contraente</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Dato etichetta="Nome / Ragione sociale" largo><span className="font-medium">{contratto.contraente_nome}</span></Dato>
                <Dato etichetta="CF / Partita IVA">{contratto.contraente_codice_fiscale || '—'}</Dato>
                <Dato etichetta="PEC">{contratto.contraente_pec || '—'}</Dato>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Importo, durata e riferimenti</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Dato etichetta="Importo (IVA esclusa)"><span className="font-medium tabular-nums">{formatImporto(contratto.importo)}</span></Dato>
                <Dato etichetta="CIG"><span className="font-mono">{contratto.cig || '—'}</span></Dato>
                <Dato etichetta="CUP"><span className="font-mono">{contratto.cup || '—'}</span></Dato>
                <Dato etichetta="Durata">
                  {contratto.data_inizio ? formatData(contratto.data_inizio) : '—'} → {contratto.data_fine ? formatData(contratto.data_fine) : '—'}
                </Dato>
                {contratto.protocollo_collegato && (
                  <Dato etichetta="Protocollo collegato" largo>
                    <span className="flex items-center gap-1 font-mono text-[#003399]">
                      <Link className="h-3.5 w-3.5" />
                      {contratto.protocollo_collegato}
                    </span>
                  </Dato>
                )}
                {contratto.note && <Dato etichetta="Note" largo><span className="text-gray-700">{contratto.note}</span></Dato>}
              </dl>
            </CardContent>
          </Card>

          {/* Allegati */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Paperclip className="h-4 w-4" />
                Allegati
                {allegati.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{allegati.length}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {allegati.length === 0 ? (
                <p className="text-sm text-gray-400">Nessun allegato</p>
              ) : (
                <ul className="space-y-2">
                  {allegati.map((a) => {
                    const isPdf = a.tipo_mime === 'application/pdf' || a.nome_file.toLowerCase().endsWith('.pdf');
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-gray-50 px-3 py-2 text-sm">
                        <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        <span className="min-w-0 flex-1 basis-40 truncate" title={a.nome_file}>{a.nome_file}</span>
                        <span className="ml-auto flex flex-shrink-0 items-center">
                          <span className="mr-1 text-xs text-gray-400">{formatBytes(a.dimensione_bytes)}</span>
                          {isPdf && (
                            <Button
                              variant="ghost" size="sm" title="Scarica con stampigliatura di repertorio"
                              onClick={conErrore(() => downloadAllegatoStampigliato(a, {
                                nome_gal: NOME_ENTE,
                                numero_protocollo: contratto.numero_completo,
                                registro: 'repertorio',
                                data_stampa: new Date().toISOString(),
                              }), 'Errore durante il download con stampigliatura')}
                            >
                              <Stamp className="h-4 w-4 text-[#003399]" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" title="Vedi documento"
                            onClick={conErrore(() => visualizzaAllegato(a), 'Errore durante l\'apertura del documento')}>
                            <Eye className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Scarica originale"
                            onClick={conErrore(() => downloadAllegato(a), 'Errore durante il download')}>
                            <Download className="h-4 w-4" />
                          </Button>
                          {isOperatore && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" title="Elimina allegato">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Elimina allegato</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Eliminare il file <strong>{a.nome_file}</strong>? L'operazione è irreversibile.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleEliminaAllegato(a)}>
                                    Elimina
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {isOperatore && (
                <div className="space-y-2 border-t pt-4">
                  <AllegatiUpload files={nuoviFiles} onChange={setNuoviFiles} disabled={caricandoFile} />
                  {nuoviFiles.length > 0 && (
                    <Button size="sm" onClick={caricaNuoviFile} disabled={caricandoFile}>
                      <Upload className="mr-2 h-4 w-4" />
                      {caricandoFile ? 'Caricamento...' : `Carica ${nuoviFiles.length === 1 ? 'il file' : `${nuoviFiles.length} file`}`}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Colonna laterale */}
        <div className="min-w-0 space-y-5">
          {isOperatore && (
            <Card>
              <CardHeader><CardTitle className="text-base">Stato</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                <Label className="text-xs">Aggiorna stato</Label>
                <Select value={contratto.stato} onValueChange={(v) => cambiaStato(v as StatoContratto)} disabled={aggiornandoStato}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LABEL_STATO_CONTRATTO) as StatoContratto[]).map((s) => (
                      <SelectItem key={s} value={s}>{LABEL_STATO_CONTRATTO[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

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
                      <p className="text-xs font-semibold text-gray-700">{azione.azione.replace(/_/g, ' ')}</p>
                      {azione.dettaglio && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {Object.entries(azione.dettaglio).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' → ')}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-400">
                        {formatData(azione.created_at, true)}
                        {azione.profilo?.nome_completo ? ` — ${azione.profilo.nome_completo}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modale numero e data di repertorio (solo admin) */}
      {modaleNumero && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Modifica numero e data</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                Attuale: <strong className="font-mono">{contratto.numero_completo}</strong> del{' '}
                <strong>{formatData(contratto.data_repertorio, true)}</strong>
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label htmlFor="nuovoNumero">Numero di repertorio</Label>
                <input id="nuovoNumero" type="number" min="1" value={nuovoNumero} autoFocus
                  onChange={(e) => setNuovoNumero(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]" />
              </div>
              <div>
                <Label htmlFor="nuovaData">Data e ora di repertorio</Label>
                <input id="nuovaData" type="datetime-local" value={nuovaData}
                  min={`${contratto.anno}-01-01T00:00`} max={`${contratto.anno}-12-31T23:59`}
                  onChange={(e) => setNuovaData(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]" />
                <p className="mt-1 text-xs text-gray-500">Deve rientrare nell'anno {contratto.anno}.</p>
              </div>
              <p className="text-xs text-amber-600">
                Attenzione: il numero di repertorio è riportato sul contratto. Modificalo solo per correggere un errore;
                ogni modifica viene registrata nello storico.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setModaleNumero(false)} disabled={salvandoNumero}>Annulla</Button>
              <Button size="sm" onClick={salvaNumeroData} disabled={salvandoNumero}>
                {salvandoNumero ? 'Salvataggio...' : 'Salva'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
