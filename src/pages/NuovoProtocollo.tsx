// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownCircle, ArrowUpCircle, Mail, Send, FileText, Monitor, ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AllegatiUpload } from '@/components/AllegatiUpload';
import { useAuth } from '@/hooks/useAuth';
import { creaProtocollo, caricaAllegato, logAzione } from '@/hooks/useProtocolli';
import { getProssimoNumeroPreview, formatNumeroCompleto } from '@/lib/numerazione';
import { UFFICI, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { TipoFlusso, Canale, StatoProtocollo } from '@/types';

const annoCorrente = new Date().getFullYear();

const CANALI: { valore: Canale; etichetta: string; icona: React.ReactNode; colore: string }[] = [
  { valore: 'pec', etichetta: 'PEC', icona: <Send className="h-5 w-5" />, colore: 'border-purple-300 bg-purple-50 text-purple-700' },
  { valore: 'email', etichetta: 'Email', icona: <Mail className="h-5 w-5" />, colore: 'border-blue-300 bg-blue-50 text-blue-700' },
  { valore: 'cartaceo', etichetta: 'Cartaceo', icona: <FileText className="h-5 w-5" />, colore: 'border-gray-300 bg-gray-50 text-gray-700' },
  { valore: 'digitale', etichetta: 'Digitale', icona: <Monitor className="h-5 w-5" />, colore: 'border-teal-300 bg-teal-50 text-teal-700' },
];

export default function NuovoProtocollo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [prossimoNumero, setProssimoNumero] = useState<number | null>(null);

  const [tipoFlusso, setTipoFlusso] = useState<TipoFlusso>('arrivo');
  const [canale, setCanale] = useState<Canale>('pec');
  const [dataDocumento, setDataDocumento] = useState('');
  const [oggetto, setOggetto] = useState('');
  const [mittente_nome, setMittenteNome] = useState('');
  const [mittente_email, setMittenteEmail] = useState('');
  const [mittente_pec, setMittentePec] = useState('');
  const [destinatario_nome, setDestinatarioNome] = useState('');
  const [destinatario_email, setDestinatarioEmail] = useState('');
  const [destinatario_pec, setDestinatarioPec] = useState('');
  const [ufficio, setUfficio] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [protocolloCollegato, setProtocolloCollegato] = useState('');
  // In uscita il numero viene comunicato al destinatario: proposto bloccato di default
  const [bloccaNumero, setBloccaNumero] = useState(false);

  useEffect(() => {
    setBloccaNumero(tipoFlusso === 'partenza');
  }, [tipoFlusso]);

  useEffect(() => {
    setProssimoNumero(null);
    getProssimoNumeroPreview(annoCorrente, tipoFlusso)
      .then(setProssimoNumero)
      .catch(() => setProssimoNumero(null));
  }, [tipoFlusso]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oggetto.trim()) { toast.error('L\'oggetto è obbligatorio'); return; }
    if (!canale) { toast.error('Seleziona il canale'); return; }

    setLoading(true);
    try {
      // Numero, anno e data li assegna il database al salvataggio (supabase/schema.sql):
      // nessun numero viene consumato se la registrazione fallisce
      const protocollo = await creaProtocollo({
        data_documento: dataDocumento || undefined,
        tipo_flusso: tipoFlusso,
        canale,
        oggetto: oggetto.trim(),
        mittente_nome: mittente_nome || undefined,
        mittente_email: mittente_email || undefined,
        mittente_pec: mittente_pec || undefined,
        destinatario_nome: destinatario_nome || undefined,
        destinatario_email: destinatario_email || undefined,
        destinatario_pec: destinatario_pec || undefined,
        ufficio_assegnatario: ufficio || undefined,
        stato: 'ricevuto' as StatoProtocollo,
        note: note || undefined,
        protocollo_collegato: protocolloCollegato || undefined,
        bloccato: bloccaNumero,
      });
      const numeroCompleto = protocollo.numero_completo;

      // Log
      if (user) {
        await logAzione(protocollo.id, user.id, 'CREAZIONE', { numero_completo: numeroCompleto });
      }

      // Upload allegati: il protocollo è già registrato, quindi un upload fallito
      // non deve far restare l'utente sul form (un nuovo invio creerebbe un duplicato)
      let allegatiFalliti = 0;
      if (files.length > 0 && user) {
        const esiti = await Promise.allSettled(
          files.map((f) => caricaAllegato(protocollo.id, f, user.id))
        );
        allegatiFalliti = esiti.filter((r) => r.status === 'rejected').length;
      }

      toast.success(`Protocollo ${numeroCompleto} registrato con successo`);
      if (allegatiFalliti > 0) {
        toast.warning(`${allegatiFalliti} allegato/i non caricato/i: riprovare dalla pagina di modifica del protocollo`);
      }
      navigate(`/protocollo/${protocollo.id}`);
    } catch {
      toast.error('Errore durante la registrazione del protocollo. Riprovare o contattare l\'amministratore.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Indietro
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuovo Protocollo</h1>
          {prossimoNumero !== null && (
            <p className="text-sm text-gray-500">
              Verrà assegnato il numero:{' '}
              <span className="font-mono font-semibold text-[#003399]">
                {formatNumeroCompleto(annoCorrente, prossimoNumero, tipoFlusso)}
              </span>
            </p>
          )}
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
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-6 transition-all',
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    {UFFICI.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
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
            <CardTitle className="text-base">Allegati</CardTitle>
          </CardHeader>
          <CardContent>
            <AllegatiUpload files={files} onChange={setFiles} disabled={loading} />
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
                placeholder={`Es. A/0042/${annoCorrente}`}
                value={protocolloCollegato}
                onChange={(e) => setProtocolloCollegato(e.target.value)}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#003399]"
                checked={bloccaNumero}
                onChange={(e) => setBloccaNumero(e.target.checked)}
              />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium text-gray-800">
                  <Lock className="h-3.5 w-3.5" />
                  Blocca il numero di protocollo
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Un protocollo bloccato non viene mai modificato dalla rinumerazione.
                  Consigliato per le comunicazioni già inviate. Solo un amministratore può sbloccarlo.
                </span>
              </span>
            </label>
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
                Registrazione in corso...
              </span>
            ) : 'Registra Protocollo'}
          </Button>
        </div>
      </form>
    </div>
  );
}
