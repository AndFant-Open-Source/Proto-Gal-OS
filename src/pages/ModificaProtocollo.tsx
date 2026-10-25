// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDownCircle, ArrowUpCircle, Mail, Send, FileText, Monitor, ArrowLeft, Paperclip, Download, Trash2, Eye, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AllegatiUpload } from '@/components/AllegatiUpload';
import { useAuth } from '@/hooks/useAuth';
import { getProtocollo, aggiornaProtocollo, logAzione, caricaAllegato, eliminaAllegato, downloadAllegato, visualizzaAllegato } from '@/hooks/useProtocolli';
import { UFFICI, cn, LABEL_STATO, LABEL_FLUSSO, formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import type { Protocollo, TipoFlusso, Canale, StatoProtocollo, Allegato } from '@/types';

const CANALI: { valore: Canale; etichetta: string; icona: React.ReactNode; colore: string }[] = [
  { valore: 'pec', etichetta: 'PEC', icona: <Send className="h-5 w-5" />, colore: 'border-purple-300 bg-purple-50 text-purple-700' },
  { valore: 'email', etichetta: 'Email', icona: <Mail className="h-5 w-5" />, colore: 'border-blue-300 bg-blue-50 text-blue-700' },
  { valore: 'cartaceo', etichetta: 'Cartaceo', icona: <FileText className="h-5 w-5" />, colore: 'border-gray-300 bg-gray-50 text-gray-700' },
  { valore: 'digitale', etichetta: 'Digitale', icona: <Monitor className="h-5 w-5" />, colore: 'border-teal-300 bg-teal-50 text-teal-700' },
];

const STATI: { valore: StatoProtocollo; etichetta: string }[] = [
  { valore: 'ricevuto', etichetta: LABEL_STATO.ricevuto },
  { valore: 'in_lavorazione', etichetta: LABEL_STATO.in_lavorazione },
  { valore: 'evaso', etichetta: LABEL_STATO.evaso },
  { valore: 'archiviato', etichetta: LABEL_STATO.archiviato },
];

export default function ModificaProtocollo() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [caricamento, setCaricamento] = useState(true);
  const [protocollo, setProtocollo] = useState<Protocollo | null>(null);

  // Campi form
  const [tipoFlusso, setTipoFlusso] = useState<TipoFlusso>('arrivo');
  const [canale, setCanale] = useState<Canale>('pec');
  const [stato, setStato] = useState<StatoProtocollo>('ricevuto');
  const [dataDocumento, setDataDocumento] = useState('');
  const [oggetto, setOggetto] = useState('');
  const [mittente_nome, setMittenteNome] = useState('');
  const [mittente_email, setMittenteEmail] = useState('');
  const [mittente_pec, setMittentePec] = useState('');
  const [destinatario_nome, setDestinatarioNome] = useState('');
  const [destinatario_email, setDestinatarioEmail] = useState('');
  const [destinatario_pec, setDestinatarioPec] = useState('');
  const [ufficio, setUfficio] = useState('_nessuno_');
  const [note, setNote] = useState('');
  const [protocolloCollegato, setProtocolloCollegato] = useState('');

  // Allegati
  const [allegatiEsistenti, setAllegatiEsistenti] = useState<Allegato[]>([]);
  const [nuoviFiles, setNuoviFiles] = useState<File[]>([]);
  const [allegatiDaEliminare, setAllegatiDaEliminare] = useState<Allegato[]>([]);

  // Carica protocollo esistente
  useEffect(() => {
    if (!id) return;
    setCaricamento(true);
    getProtocollo(id)
      .then((p) => {
        // Un protocollo annullato non si modifica (regola anche del database)
        if (p.stato === 'annullato') {
          toast.error('Protocollo annullato: non può essere modificato');
          navigate(`/protocollo/${p.id}`, { replace: true });
          return;
        }
        setProtocollo(p);
        setTipoFlusso(p.tipo_flusso);
        setCanale(p.canale);
        setStato(p.stato);
        setDataDocumento(p.data_documento ? p.data_documento.substring(0, 10) : '');
        setOggetto(p.oggetto);
        setMittenteNome(p.mittente_nome ?? '');
        setMittenteEmail(p.mittente_email ?? '');
        setMittentePec(p.mittente_pec ?? '');
        setDestinatarioNome(p.destinatario_nome ?? '');
        setDestinatarioEmail(p.destinatario_email ?? '');
        setDestinatarioPec(p.destinatario_pec ?? '');
        setUfficio(p.ufficio_assegnatario ?? '_nessuno_');
        setNote(p.note ?? '');
        setProtocolloCollegato(p.protocollo_collegato ?? '');
        setAllegatiEsistenti(p.protocollo_allegati ?? []);
      })
      .catch(() => {
        toast.error('Errore nel caricamento del protocollo');
        navigate(-1);
      })
      .finally(() => setCaricamento(false));
  }, [id, navigate]);

  const rimuoviAllegatoEsistente = (allegato: Allegato) => {
    setAllegatiDaEliminare((prev) => [...prev, allegato]);
    setAllegatiEsistenti((prev) => prev.filter((a) => a.id !== allegato.id));
  };

  const ripristinaAllegato = (allegato: Allegato) => {
    setAllegatiDaEliminare((prev) => prev.filter((a) => a.id !== allegato.id));
    setAllegatiEsistenti((prev) => [...prev, allegato]);
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
    } catch {
      toast.error('Errore durante il download');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !protocollo || !user) return;
    if (!oggetto.trim()) { toast.error("L'oggetto è obbligatorio"); return; }

    const cambioTipo = tipoFlusso !== protocollo.tipo_flusso;
    if (cambioTipo && !confirm(
      `Cambiando il tipo da ${LABEL_FLUSSO[protocollo.tipo_flusso]} a ${LABEL_FLUSSO[tipoFlusso]} verrà assegnato un nuovo numero della serie ${LABEL_FLUSSO[tipoFlusso]}. ` +
      `Il numero ${protocollo.numero_completo} resterà vacante. Continuare?`
    )) return;

    setLoading(true);
    let aggiornato: Protocollo;
    try {
      // null (non undefined) per i campi svuotati: undefined viene omesso
      // dalla richiesta e il vecchio valore resterebbe nel database
      aggiornato = await aggiornaProtocollo(id, {
        tipo_flusso: tipoFlusso,
        canale,
        stato,
        data_documento: dataDocumento || null,
        oggetto: oggetto.trim(),
        mittente_nome: mittente_nome.trim() || null,
        mittente_email: mittente_email.trim() || null,
        mittente_pec: mittente_pec.trim() || null,
        destinatario_nome: destinatario_nome.trim() || null,
        destinatario_email: destinatario_email.trim() || null,
        destinatario_pec: destinatario_pec.trim() || null,
        ufficio_assegnatario: (ufficio && ufficio !== '_nessuno_') ? ufficio : null,
        note: note.trim() || null,
        protocollo_collegato: protocolloCollegato.trim() || null,
      });
    } catch {
      toast.error('Impossibile salvare le modifiche al protocollo. Riprova o contatta l\'amministratore.');
      setLoading(false);
      return;
    }

    // Eliminazioni e caricamenti sono indipendenti: il fallimento di un'eliminazione
    // non deve impedire il caricamento dei nuovi allegati (e viceversa)
    const esitiEliminazione = await Promise.allSettled(allegatiDaEliminare.map((a) => eliminaAllegato(a)));
    const esitiCaricamento = await Promise.allSettled(nuoviFiles.map((f) => caricaAllegato(id, f, user.id)));

    const nonEliminati = allegatiDaEliminare.filter((_, i) => esitiEliminazione[i].status === 'rejected');
    const nonCaricati = nuoviFiles.filter((_, i) => esitiCaricamento[i].status === 'rejected');
    const eliminati = allegatiDaEliminare.filter((_, i) => esitiEliminazione[i].status === 'fulfilled');
    const caricati = nuoviFiles.filter((_, i) => esitiCaricamento[i].status === 'fulfilled');

    // Con il cambio di tipo il database assegna il nuovo numero (trigger protocollo_proteggi_campi)
    if (cambioTipo) {
      await logAzione(id, user.id, 'CAMBIO_TIPO_FLUSSO', {
        vecchio_numero: protocollo.numero_completo,
        nuovo_numero: aggiornato.numero_completo,
      });
      setProtocollo((prev) => (prev ? { ...prev, ...aggiornato } : prev));
    }

    await logAzione(id, user.id, 'MODIFICA', {
      numero_completo: aggiornato.numero_completo,
      ...(eliminati.length > 0 && { allegati_eliminati: eliminati.map((a) => a.nome_file).join(', ') }),
      ...(caricati.length > 0 && { allegati_aggiunti: caricati.map((f) => f.name).join(', ') }),
    });

    setLoading(false);

    if (cambioTipo) {
      toast.info(`Nuovo numero di protocollo: ${aggiornato.numero_completo}`, { duration: 8000 });
    }

    if (nonEliminati.length === 0 && nonCaricati.length === 0) {
      toast.success('Protocollo aggiornato con successo');
      navigate(`/protocollo/${id}`);
      return;
    }

    // Esito parziale: si resta sulla pagina mostrando cosa non è andato a buon fine
    if (nonEliminati.length > 0) {
      toast.error(`Non è stato possibile eliminare: ${nonEliminati.map((a) => a.nome_file).join(', ')}. Verifica i permessi con l'amministratore.`);
    }
    if (nonCaricati.length > 0) {
      toast.error(`Non è stato possibile caricare: ${nonCaricati.map((f) => f.name).join(', ')}. Riprova.`);
    }
    toast.success('Dati del protocollo salvati');
    setAllegatiEsistenti((prev) => [...prev, ...nonEliminati]);
    setAllegatiDaEliminare([]);
    setNuoviFiles(nonCaricati);
    getProtocollo(id)
      .then((p) => setAllegatiEsistenti(p.protocollo_allegati ?? []))
      .catch(() => { /* la lista resta quella locale */ });
  };

  if (caricamento) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }

  if (!protocollo) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Indietro
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modifica Protocollo</h1>
          <p className="text-sm text-gray-500">
            Numero:{' '}
            <span className="font-mono font-semibold text-[#003399]">
              {protocollo.numero_completo}
            </span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo flusso */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tipo di Documento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {(['arrivo', 'partenza'] as TipoFlusso[]).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoFlusso(tipo)}
                  disabled={protocollo.bloccato}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-6 transition-all disabled:cursor-not-allowed disabled:opacity-60',
                    tipoFlusso === tipo
                      ? tipo === 'arrivo'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  {tipo === 'arrivo' ? (
                    <ArrowDownCircle className="h-10 w-10" />
                  ) : (
                    <ArrowUpCircle className="h-10 w-10" />
                  )}
                  <span className="text-lg font-semibold capitalize">{tipo}</span>
                </button>
              ))}
            </div>
            {protocollo.bloccato && (
              <p className="mt-3 flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-600">
                <Lock className="h-3.5 w-3.5" />
                Protocollo bloccato: il tipo (entrata/uscita) non può essere cambiato.
              </p>
            )}
            {tipoFlusso !== protocollo.tipo_flusso && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Al salvataggio verrà assegnato un nuovo numero della serie {LABEL_FLUSSO[tipoFlusso]};
                il numero {protocollo.numero_completo} resterà vacante nella serie {LABEL_FLUSSO[protocollo.tipo_flusso]}.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Canale */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Canale di Ricezione / Invio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CANALI.map((c) => (
                <button
                  key={c.valore}
                  type="button"
                  onClick={() => setCanale(c.valore)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                    canale === c.valore ? `border-2 ${c.colore}` : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  {c.icona}
                  <span className="text-sm font-medium">{c.etichetta}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Dati principali */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dati del Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="dataDocumento">Data documento</Label>
                <Input
                  id="dataDocumento"
                  type="date"
                  value={dataDocumento}
                  onChange={(e) => setDataDocumento(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ufficio">Ufficio assegnatario</Label>
                <Select value={ufficio} onValueChange={setUfficio}>
                  <SelectTrigger id="ufficio">
                    <SelectValue placeholder="Seleziona ufficio..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_nessuno_">— Nessuno —</SelectItem>
                    {UFFICI.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stato">Stato</Label>
                <Select value={stato} onValueChange={(v) => setStato(v as StatoProtocollo)}>
                  <SelectTrigger id="stato">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATI.map((s) => (
                      <SelectItem key={s.valore} value={s.valore}>{s.etichetta}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oggetto">
                Oggetto <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="oggetto"
                placeholder="Descrivi brevemente il contenuto del documento..."
                value={oggetto}
                onChange={(e) => setOggetto(e.target.value)}
                rows={3}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Mittente / Destinatario */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {tipoFlusso === 'arrivo' ? 'Mittente' : 'Destinatario'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tipoFlusso === 'arrivo' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mittente_nome">Nome / Ragione Sociale</Label>
                  <Input id="mittente_nome" value={mittente_nome} onChange={(e) => setMittenteNome(e.target.value)} placeholder="Es. Regione Siciliana" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="mittente_email">Email</Label>
                    <Input id="mittente_email" type="email" value={mittente_email} onChange={(e) => setMittenteEmail(e.target.value)} placeholder="mittente@esempio.it" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mittente_pec">PEC</Label>
                    <Input id="mittente_pec" type="email" value={mittente_pec} onChange={(e) => setMittentePec(e.target.value)} placeholder="mittente@pec.esempio.it" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="destinatario_nome">Nome / Ragione Sociale</Label>
                  <Input id="destinatario_nome" value={destinatario_nome} onChange={(e) => setDestinatarioNome(e.target.value)} placeholder="Es. Comune di Palermo" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="destinatario_email">Email</Label>
                    <Input id="destinatario_email" type="email" value={destinatario_email} onChange={(e) => setDestinatarioEmail(e.target.value)} placeholder="destinatario@esempio.it" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="destinatario_pec">PEC</Label>
                    <Input id="destinatario_pec" type="email" value={destinatario_pec} onChange={(e) => setDestinatarioPec(e.target.value)} placeholder="destinatario@pec.esempio.it" />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Allegati */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4" />
              Allegati
              {allegatiEsistenti.length > 0 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {allegatiEsistenti.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Allegati già caricati */}
            {allegatiEsistenti.length > 0 && (
              <ul className="space-y-2">
                {allegatiEsistenti.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-md border bg-gray-50 px-3 py-2 text-sm"
                  >
                    <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />
                    <span className="flex-1 truncate">{a.nome_file}</span>
                    <span className="text-xs text-gray-400">{formatBytes(a.dimensione_bytes)}</span>
                    <button
                      type="button"
                      onClick={() => handleVisualizzaAllegato(a)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Vedi documento"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadAllegato(a)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Scarica"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {/* Allegati delle PEC: fissati dalla protocollazione, non si tolgono */}
                    {protocollo.registro !== 'pec' && (
                    <button
                      type="button"
                      onClick={() => rimuoviAllegatoEsistente(a)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title="Rimuovi allegato"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Allegati da rimuovere al salvataggio (ripristinabili) */}
            {allegatiDaEliminare.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-700">
                  {allegatiDaEliminare.length === 1
                    ? '1 allegato verrà eliminato al salvataggio:'
                    : `${allegatiDaEliminare.length} allegati verranno eliminati al salvataggio:`}
                </p>
                <ul className="space-y-1">
                  {allegatiDaEliminare.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-gray-500 line-through">{a.nome_file}</span>
                      <button
                        type="button"
                        onClick={() => ripristinaAllegato(a)}
                        className="text-xs font-medium text-[#003399] hover:underline"
                      >
                        Annulla rimozione
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Aggiungi nuovi allegati (non per i protocolli PEC: i file sono quelli della PEC) */}
            {protocollo.registro === 'pec' ? (
              <p className="text-xs text-gray-500">I file di un protocollo PEC sono quelli della PEC importata e non si modificano.</p>
            ) : (
              <AllegatiUpload files={nuoviFiles} onChange={setNuoviFiles} disabled={loading} />
            )}
          </CardContent>
        </Card>

        {/* Note e protocollo collegato */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Note e Collegamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="note">Note interne</Label>
              <Textarea
                id="note"
                placeholder="Note aggiuntive (uso interno)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="protocolloCollegato">Protocollo collegato (es. risposta a)</Label>
              <Input
                id="protocolloCollegato"
                placeholder={`Es. A/0042/${protocollo.anno}`}
                value={protocolloCollegato}
                onChange={(e) => setProtocolloCollegato(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Azioni */}
        <div className="flex gap-3 pb-6">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={loading}>
            Annulla
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvataggio in corso...
              </span>
            ) : 'Salva Modifiche'}
          </Button>
        </div>
      </form>
    </div>
  );
}
