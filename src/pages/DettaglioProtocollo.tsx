// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Printer, Edit2, Clock, Paperclip, Link,
  ArrowDownCircle, ArrowUpCircle, Mail, Send, FileText, Monitor, Trash2, Stamp, Hash, Eye, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatoBadge } from '@/components/StatoBadge';
import { FascicoliDocumento } from '@/components/FascicoliDocumento';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  getProtocollo, getLogAzioni, downloadAllegato, downloadAllegatoStampigliato,
  eliminaAllegato, eliminaProtocollo, aggiornaProtocollo, logAzione, visualizzaAllegato,
} from '@/hooks/useProtocolli';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { NOME_ENTE } from '@/lib/ente';
import { formatData, formatBytes, dataConFusoLocale, LABEL_CANALE, LABEL_FLUSSO, LABEL_STATO } from '@/lib/utils';
import { toast } from 'sonner';
import type { Protocollo, LogAzione, Allegato, StatoProtocollo } from '@/types';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


const IconaCanale: Record<string, React.ReactNode> = {
  pec: <Send className="h-4 w-4 text-purple-600" />,
  email: <Mail className="h-4 w-4 text-blue-600" />,
  cartaceo: <FileText className="h-4 w-4 text-gray-600" />,
  digitale: <Monitor className="h-4 w-4 text-teal-600" />,
};

export default function DettaglioProtocollo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, isOperatore } = useAuth();
  const [protocollo, setProtocollo] = useState<Protocollo | null>(null);
  const [log, setLog] = useState<LogAzione[]>([]);
  const [loading, setLoading] = useState(true);
  const [aggiornandoStato, setAggiornandoStato] = useState(false);
  const [modaleNumero, setModaleNumero] = useState(false);
  const [nuovoNumero, setNuovoNumero] = useState('');
  const [nuovaData, setNuovaData] = useState('');
  const [salvandoNumero, setSalvandoNumero] = useState(false);
  const [cambiandoBlocco, setCambiandoBlocco] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getProtocollo(id), getLogAzioni(id)])
      .then(([p, l]) => { setProtocollo(p); setLog(l); })
      .catch(() => toast.error('Errore nel caricamento del protocollo'))
      .finally(() => setLoading(false));
  }, [id]);

  const cambiaStato = async (nuovoStato: StatoProtocollo) => {
    if (!protocollo || !user) return;
    setAggiornandoStato(true);
    try {
      const vecchioStato = protocollo.stato;
      const aggiornato = await aggiornaProtocollo(protocollo.id, { stato: nuovoStato });
      await logAzione(protocollo.id, user.id, 'MODIFICA_STATO', {
        vecchio_stato: vecchioStato, nuovo_stato: nuovoStato,
      });
      // aggiornaProtocollo non restituisce gli allegati: li conserviamo
      setProtocollo((prev) => (prev ? { ...aggiornato, protocollo_allegati: prev.protocollo_allegati } : aggiornato));
      const nuovoLog = await getLogAzioni(protocollo.id);
      setLog(nuovoLog);
      toast.success(`Stato aggiornato a: ${LABEL_STATO[nuovoStato]}`);
    } catch {
      toast.error('Errore durante l\'aggiornamento dello stato');
    } finally {
      setAggiornandoStato(false);
    }
  };

  const handleVisualizzaAllegato = async (allegato: Allegato) => {
    try {
      await visualizzaAllegato(allegato);
    } catch {
      toast.error('Errore durante l\'apertura del documento');
    }
  };

  const handleDownloadAllegato = async (allegato: Allegato) => {
    try {
      await downloadAllegato(allegato);
      toast.success(`Download di ${allegato.nome_file} avviato`);
    } catch {
      toast.error('Errore durante il download');
    }
  };

  const handleDownloadStampigliato = async (allegato: Allegato) => {
    if (!protocollo) return;
    try {
      await downloadAllegatoStampigliato(allegato, {
        nome_gal: NOME_ENTE,
        numero_protocollo: protocollo.numero_completo,
        tipo_flusso: protocollo.tipo_flusso,
        data_stampa: new Date().toISOString(),
      });
      toast.success(`Download con stampigliatura avviato`);
    } catch {
      toast.error('Errore durante il download con stampigliatura');
    }
  };

  const apriModaleNumero = () => {
    if (!protocollo) return;
    setNuovoNumero(String(protocollo.numero));
    setNuovaData(format(parseISO(protocollo.data_registrazione), "yyyy-MM-dd'T'HH:mm"));
    setModaleNumero(true);
  };

  const salvaNumeroData = async () => {
    if (!protocollo || !user) return;
    const n = parseInt(nuovoNumero, 10);
    if (isNaN(n) || n < 1) { toast.error('Inserisci un numero valido'); return; }

    // datetime-local è in ora locale: new Date() la interpreta correttamente
    const data = new Date(nuovaData);
    if (!nuovaData || isNaN(data.getTime())) { toast.error('Inserisci una data di protocollazione valida'); return; }
    if (data.getFullYear() !== protocollo.anno) {
      toast.error(`La data deve appartenere all'anno di protocollo ${protocollo.anno}`);
      return;
    }
    if (data.getTime() > Date.now()) { toast.error('La data di protocollazione non può essere nel futuro'); return; }

    const numeroCambiato = n !== protocollo.numero;
    const dataCambiata = data.getTime() !== parseISO(protocollo.data_registrazione).getTime();
    if (!numeroCambiato && !dataCambiata) { setModaleNumero(false); return; }

    setSalvandoNumero(true);
    try {
      const aggiornato = await aggiornaProtocollo(protocollo.id, {
        ...(numeroCambiato && { numero: n }),
        ...(dataCambiata && { data_registrazione: dataConFusoLocale(data) }),
      });
      if (numeroCambiato) {
        await logAzione(protocollo.id, user.id, 'MODIFICA_NUMERO', {
          vecchio_numero: protocollo.numero_completo, nuovo_numero: aggiornato.numero_completo,
        });
      }
      if (dataCambiata) {
        await logAzione(protocollo.id, user.id, 'MODIFICA_DATA_PROTOCOLLO', {
          vecchia_data: formatData(protocollo.data_registrazione, true),
          nuova_data: formatData(aggiornato.data_registrazione, true),
        });
      }
      setProtocollo((prev) => (prev ? { ...aggiornato, protocollo_allegati: prev.protocollo_allegati } : aggiornato));
      setModaleNumero(false);
      toast.success('Protocollo aggiornato');
      const nuovoLog = await getLogAzioni(protocollo.id);
      setLog(nuovoLog);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/duplicate key|23505/i.test(msg)) {
        toast.error(`Il numero ${n} è già assegnato a un altro protocollo ${LABEL_FLUSSO[protocollo.tipo_flusso]} del ${protocollo.anno}`);
      } else {
        toast.error('Errore durante la modifica del numero o della data');
      }
    } finally {
      setSalvandoNumero(false);
    }
  };

  // Blocco: lo può impostare un operatore o un admin, toglierlo solo un admin
  // (la regola è applicata anche dal database, trigger protocollo_proteggi_campi)
  const cambiaBlocco = async (blocca: boolean) => {
    if (!protocollo || !user) return;
    const messaggio = blocca
      ? `Bloccare il protocollo ${protocollo.numero_completo}?\n\nNumero, tipo e data non potranno più essere modificati e la rinumerazione non lo toccherà.` +
        (isAdmin ? '' : ' Solo un amministratore potrà sbloccarlo.')
      : `Sbloccare il protocollo ${protocollo.numero_completo}?\n\nUna successiva rinumerazione potrà cambiarne il numero.`;
    if (!confirm(messaggio)) return;

    setCambiandoBlocco(true);
    try {
      const aggiornato = await aggiornaProtocollo(protocollo.id, { bloccato: blocca });
      await logAzione(protocollo.id, user.id, blocca ? 'BLOCCO_PROTOCOLLO' : 'SBLOCCO_PROTOCOLLO', {
        numero_completo: protocollo.numero_completo,
      });
      setProtocollo((prev) => (prev ? { ...aggiornato, protocollo_allegati: prev.protocollo_allegati } : aggiornato));
      setLog(await getLogAzioni(protocollo.id));
      toast.success(blocca ? 'Protocollo bloccato' : 'Protocollo sbloccato');
    } catch {
      toast.error(blocca
        ? 'Impossibile bloccare il protocollo'
        : 'Impossibile sbloccare il protocollo: operazione riservata agli amministratori');
    } finally {
      setCambiandoBlocco(false);
    }
  };

  const handleEliminaProtocollo = async () => {
    if (!protocollo || !user) return;
    try {
      // L'azione ELIMINAZIONE viene registrata nello storico dal database (trigger)
      await eliminaProtocollo(protocollo.id);
      // Il CASCADE elimina solo i record degli allegati: rimuoviamo anche i file fisici
      const percorsi = (protocollo.protocollo_allegati ?? []).map((a) => a.storage_path);
      if (percorsi.length > 0) {
        const { error: errStorage } = await supabase.storage.from('allegati-protocollo').remove(percorsi);
        if (errStorage) console.warn('File allegati non rimossi dallo storage:', errStorage.message);
      }
      toast.success(`Protocollo ${protocollo.numero_completo} eliminato`);
      navigate('/registro');
    } catch {
      toast.error("Errore durante l'eliminazione del protocollo");
    }
  };

  const handleEliminaAllegato = async (allegato: Allegato) => {
    if (!user) return;
    try {
      await eliminaAllegato(allegato);
      await logAzione(protocollo?.id, user.id, 'ELIMINA_ALLEGATO', { nome_file: allegato.nome_file });
      setProtocollo((prev) =>
        prev ? { ...prev, protocollo_allegati: prev.protocollo_allegati?.filter((a) => a.id !== allegato.id) } : prev
      );
      toast.success('Allegato eliminato');
    } catch {
      toast.error('Errore durante l\'eliminazione dell\'allegato');
    }
  };

  const stampaPDF = () => {
    if (!protocollo) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFontSize(14);
    doc.setTextColor(0, 51, 153);
    doc.text(NOME_ENTE, 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(50);
    doc.text('SCHEDA PROTOCOLLO', 14, 26);

    doc.setFontSize(18);
    doc.setTextColor(0, 51, 153);
    doc.text(protocollo.numero_completo, 14, 36);

    autoTable(doc, {
      startY: 42,
      body: [
        ['Data registrazione', formatData(protocollo.data_registrazione)],
        ['Data documento', formatData(protocollo.data_documento)],
        ['Tipo flusso', LABEL_FLUSSO[protocollo.tipo_flusso]],
        ['Canale', LABEL_CANALE[protocollo.canale]],
        ['Stato', LABEL_STATO[protocollo.stato]],
        ['Numero bloccato', protocollo.bloccato ? `Sì (dal ${formatData(protocollo.bloccato_il ?? undefined, true)})` : 'No'],
        ['Oggetto', protocollo.oggetto],
        ['Mittente', protocollo.mittente_nome ?? '—'],
        ['Email mittente', protocollo.mittente_email ?? '—'],
        ['PEC mittente', protocollo.mittente_pec ?? '—'],
        ['Destinatario', protocollo.destinatario_nome ?? '—'],
        ['Email destinatario', protocollo.destinatario_email ?? '—'],
        ['Ufficio assegnatario', protocollo.ufficio_assegnatario ?? '—'],
        ['Note', protocollo.note ?? '—'],
      ],
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      headStyles: { fillColor: [0, 51, 153] },
    });

    doc.save(`protocollo_${protocollo.numero_completo.replace(/\//g, '-')}.pdf`);
    toast.success('PDF generato');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }

  if (!protocollo) {
    return (
      <div className="py-24 text-center">
        <p className="text-gray-500">Protocollo non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/registro')}>
          Torna al registro
        </Button>
      </div>
    );
  }

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
            <h1 className="whitespace-nowrap text-2xl font-bold font-mono text-[#003399]">
              {protocollo.numero_completo}
            </h1>
            <StatoBadge stato={protocollo.stato} />
            {protocollo.bloccato && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                title="Numero bloccato: escluso dalla rinumerazione"
              >
                <Lock className="h-3 w-3" />
                Bloccato
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Registrato il {formatData(protocollo.data_registrazione, true)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={stampaPDF}>
            <Printer className="mr-2 h-4 w-4" />
            Stampa
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={apriModaleNumero}
              disabled={protocollo.bloccato}
              title={protocollo.bloccato ? 'Protocollo bloccato: sbloccalo per modificare numero o data' : undefined}
            >
              <Hash className="mr-2 h-4 w-4" />
              Modifica numero / data
            </Button>
          )}
          {isOperatore && (
            <Button size="sm" onClick={() => navigate(`/modifica/${protocollo.id}`)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Modifica
            </Button>
          )}
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                  disabled={protocollo.bloccato}
                  title={protocollo.bloccato ? 'Protocollo bloccato: sbloccalo per eliminarlo' : undefined}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare il protocollo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Stai per eliminare definitivamente il protocollo{' '}
                    <strong>{protocollo.numero_completo}</strong> — "{protocollo.oggetto}".
                    Questa operazione è <strong>irreversibile</strong> e rimuoverà anche tutti gli allegati.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={handleEliminaProtocollo}
                  >
                    Sì, elimina definitivamente
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Due colonne solo da schermi larghi (xl): sotto, tutto in colonna unica
          per non tagliare né comprimere i contenuti */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Colonna sinistra — dati principali */}
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {/* Dati principali */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dati del Documento</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-500">Tipo flusso</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                    {protocollo.tipo_flusso === 'arrivo'
                      ? <><ArrowDownCircle className="h-4 w-4 text-green-600" />Arrivo</>
                      : <><ArrowUpCircle className="h-4 w-4 text-orange-600" />Partenza</>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Canale</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                    {IconaCanale[protocollo.canale]}
                    {LABEL_CANALE[protocollo.canale]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Data documento</dt>
                  <dd className="mt-0.5">{formatData(protocollo.data_documento) || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Ufficio assegnatario</dt>
                  <dd className="mt-0.5">{protocollo.ufficio_assegnatario || '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-gray-500">Oggetto</dt>
                  <dd className="mt-0.5 font-medium">{protocollo.oggetto}</dd>
                </div>
                {protocollo.note && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-gray-500">Note</dt>
                    <dd className="mt-0.5 text-gray-700">{protocollo.note}</dd>
                  </div>
                )}
                {protocollo.protocollo_collegato && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-gray-500">Protocollo collegato</dt>
                    <dd className="mt-0.5 flex items-center gap-1 font-mono text-[#003399]">
                      <Link className="h-3.5 w-3.5" />
                      {protocollo.protocollo_collegato}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Mittente / Destinatario */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {protocollo.tipo_flusso === 'arrivo' ? 'Mittente' : 'Destinatario'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-gray-500">Nome / Ragione Sociale</dt>
                  <dd className="mt-0.5 font-medium">
                    {protocollo.tipo_flusso === 'arrivo'
                      ? protocollo.mittente_nome || '—'
                      : protocollo.destinatario_nome || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Email</dt>
                  <dd className="mt-0.5">
                    {(protocollo.tipo_flusso === 'arrivo' ? protocollo.mittente_email : protocollo.destinatario_email) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">PEC</dt>
                  <dd className="mt-0.5">
                    {(protocollo.tipo_flusso === 'arrivo' ? protocollo.mittente_pec : protocollo.destinatario_pec) || '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Allegati */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Paperclip className="h-4 w-4" />
                Allegati
                {(protocollo.protocollo_allegati?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {protocollo.protocollo_allegati?.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!protocollo.protocollo_allegati?.length ? (
                <p className="text-sm text-gray-400">Nessun allegato</p>
              ) : (
                <ul className="space-y-2">
                  {protocollo.protocollo_allegati.map((a) => {
                    const isPdf = a.tipo_mime === 'application/pdf' || a.nome_file.toLowerCase().endsWith('.pdf');
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-gray-50 px-3 py-2 text-sm">
                        <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        <span className="min-w-0 flex-1 basis-40 truncate" title={a.nome_file}>{a.nome_file}</span>
                        <span className="ml-auto flex flex-shrink-0 items-center">
                        <span className="mr-1 text-xs text-gray-400">{formatBytes(a.dimensione_bytes)}</span>
                        {isPdf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Scarica con stampigliatura"
                            onClick={() => handleDownloadStampigliato(a)}
                          >
                            <Stamp className="h-4 w-4 text-[#003399]" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Vedi documento"
                          onClick={() => handleVisualizzaAllegato(a)}
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Scarica originale"
                          onClick={() => handleDownloadAllegato(a)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isOperatore && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Elimina allegato</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Sei sicuro di voler eliminare il file <strong>{a.nome_file}</strong>? L'operazione è irreversibile.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700"
                                  onClick={() => handleEliminaAllegato(a)}
                                >
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
            </CardContent>
          </Card>
        </div>

        {/* Colonna destra — stato, blocco e timeline */}
        <div className="min-w-0 space-y-5">
          {/* Blocco numero di protocollo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" />
                Blocco numero
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <label
                className={`flex items-start gap-3 ${
                  isOperatore && !(protocollo.bloccato && !isAdmin) && !cambiandoBlocco
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-70'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#003399]"
                  checked={protocollo.bloccato}
                  disabled={!isOperatore || (protocollo.bloccato && !isAdmin) || cambiandoBlocco}
                  onChange={(e) => cambiaBlocco(e.target.checked)}
                />
                <span className="text-sm font-medium text-gray-800">
                  {protocollo.bloccato ? 'Protocollo bloccato' : 'Blocca questo protocollo'}
                </span>
              </label>
              <p className="text-xs text-gray-500">
                {protocollo.bloccato
                  ? `Bloccato il ${formatData(protocollo.bloccato_il ?? undefined, true)}. La rinumerazione non ne cambierà il numero.` +
                    (isAdmin ? '' : ' Solo un amministratore può sbloccarlo.')
                  : 'Se bloccato, la rinumerazione non ne cambierà il numero. Consigliato per le comunicazioni già inviate.'}
              </p>
            </CardContent>
          </Card>

          {/* Cambio stato */}
          {isOperatore && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatoBadge stato={protocollo.stato} />
                <div className="space-y-1.5">
                  <Label className="text-xs">Aggiorna stato</Label>
                  <Select
                    value={protocollo.stato}
                    onValueChange={(v) => cambiaStato(v as StatoProtocollo)}
                    disabled={aggiornandoStato}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ricevuto">Ricevuto</SelectItem>
                      <SelectItem value="in_lavorazione">In lavorazione</SelectItem>
                      <SelectItem value="evaso">Evaso</SelectItem>
                      <SelectItem value="archiviato">Archiviato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          <FascicoliDocumento
            documento={{ protocollo_id: protocollo.id }}
            onCambio={() => { getLogAzioni(protocollo.id).then(setLog).catch((err: unknown) => console.error(err)); }}
          />

          {/* Timeline */}
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
                          {Object.entries(azione.dettaglio).map(([k, v]) => `${k}: ${v}`).join(' → ')}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-400">
                        {formatData(azione.created_at, true)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modale Modifica Numero e Data di protocollazione (solo admin) */}
      {modaleNumero && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Modifica numero e data</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Attuale: <strong className="font-mono">{protocollo.numero_completo}</strong> del{' '}
                <strong>{formatData(protocollo.data_registrazione, true)}</strong>
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label htmlFor="nuovoNumero">Numero di protocollo</Label>
                <input
                  id="nuovoNumero"
                  type="number"
                  min="1"
                  value={nuovoNumero}
                  onChange={(e) => setNuovoNumero(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="nuovaData">Data e ora di protocollazione</Label>
                <input
                  id="nuovaData"
                  type="datetime-local"
                  min={`${protocollo.anno}-01-01T00:00`}
                  max={`${protocollo.anno}-12-31T23:59`}
                  value={nuovaData}
                  onChange={(e) => setNuovaData(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#003399]"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Deve rientrare nell'anno {protocollo.anno}.
                </p>
              </div>
              <p className="text-xs text-amber-600">
                Attenzione: modificare numero o data manualmente può creare lacune o incongruenze
                nella sequenza. La "Rinumerazione progressiva" ordina i protocolli per data di protocollazione.
                Ogni modifica viene registrata nello storico.
              </p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setModaleNumero(false)} disabled={salvandoNumero}>
                Annulla
              </Button>
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
