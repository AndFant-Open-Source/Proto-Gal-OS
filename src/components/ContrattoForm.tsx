// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AllegatiUpload } from '@/components/AllegatiUpload';
import { LABEL_TIPO_CONTRATTO, LABEL_FORMA_STIPULA, LABEL_STATO_CONTRATTO } from '@/lib/utils';
import type { Contratto, DatiContratto, TipoContratto, FormaStipula, StatoContratto } from '@/types';

// Radix Select non accetta value="": sentinella per "nessuna forma indicata"
const NESSUNA = '__nessuna__';

/** Valori del form: tutto testo, convertito in DatiContratto al salvataggio */
interface ValoriForm {
  tipo_contratto: TipoContratto;
  forma_stipula: FormaStipula | typeof NESSUNA;
  stato: StatoContratto;
  data_stipula: string;
  oggetto: string;
  contraente_nome: string;
  contraente_codice_fiscale: string;
  contraente_pec: string;
  importo: string;
  cig: string;
  cup: string;
  data_inizio: string;
  data_fine: string;
  protocollo_collegato: string;
  note: string;
}

// Campo facoltativo: vuoto oppure conforme alla regola
const facoltativo = (schema: z.ZodType<string>) =>
  z.union([z.literal(''), schema]);

/**
 * Importo scritto all'italiana: "12.500,00", "12500,5", "12500.50", "12500".
 * Il punto seguito da gruppi di 3 cifre è il separatore delle migliaia. NaN se non valido.
 */
function parseImporto(testo: string): number {
  const t = testo.trim().replace(/\s|€/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,12}([.,]\d{1,2})?$/.test(t)) return Number(t.replace(',', '.'));
  return NaN;
}

const schema = z
  .object({
    oggetto: z.string().trim().min(1, "L'oggetto è obbligatorio"),
    contraente_nome: z.string().trim().min(1, 'Il contraente è obbligatorio'),
    contraente_codice_fiscale: facoltativo(
      z.string().trim().regex(
        /^([A-Za-z]{6}\d{2}[A-Za-z]\d{2}[A-Za-z]\d{3}[A-Za-z]|\d{11})$/,
        'Inserisci un codice fiscale (16 caratteri) o una partita IVA (11 cifre)'
      )
    ),
    contraente_pec: facoltativo(z.string().trim().email('Indirizzo PEC non valido')),
    importo: facoltativo(
      z.string().trim().refine((v) => !isNaN(parseImporto(v)), 'Importo non valido (es. 12.500,00)')
    ),
    cig: facoltativo(z.string().trim().regex(/^[A-Za-z0-9]{10}$/, 'Il CIG è di 10 caratteri')),
    cup: facoltativo(z.string().trim().regex(/^[A-Za-z0-9]{15}$/, 'Il CUP è di 15 caratteri')),
    data_inizio: z.string(),
    data_fine: z.string(),
  })
  .refine((v) => !v.data_inizio || !v.data_fine || v.data_fine >= v.data_inizio, {
    message: 'La data di fine non può precedere la data di inizio',
    path: ['data_fine'],
  });

type Errori = Partial<Record<keyof ValoriForm, string>>;

function valoriDa(contratto?: Contratto): ValoriForm {
  return {
    tipo_contratto: contratto?.tipo_contratto ?? 'servizi',
    forma_stipula: contratto?.forma_stipula ?? NESSUNA,
    stato: contratto?.stato ?? 'in_corso',
    data_stipula: contratto?.data_stipula ?? '',
    oggetto: contratto?.oggetto ?? '',
    contraente_nome: contratto?.contraente_nome ?? '',
    contraente_codice_fiscale: contratto?.contraente_codice_fiscale ?? '',
    contraente_pec: contratto?.contraente_pec ?? '',
    importo: contratto?.importo != null ? String(contratto.importo).replace('.', ',') : '',
    cig: contratto?.cig ?? '',
    cup: contratto?.cup ?? '',
    data_inizio: contratto?.data_inizio ?? '',
    data_fine: contratto?.data_fine ?? '',
    protocollo_collegato: contratto?.protocollo_collegato ?? '',
    note: contratto?.note ?? '',
  };
}

function inDatiContratto(v: ValoriForm): DatiContratto {
  const testo = (s: string) => s.trim() || null;
  return {
    tipo_contratto: v.tipo_contratto,
    forma_stipula: v.forma_stipula === NESSUNA ? null : v.forma_stipula,
    stato: v.stato,
    data_stipula: v.data_stipula || null,
    oggetto: v.oggetto.trim(),
    contraente_nome: v.contraente_nome.trim(),
    contraente_codice_fiscale: testo(v.contraente_codice_fiscale)?.toUpperCase() ?? null,
    contraente_pec: testo(v.contraente_pec),
    importo: v.importo.trim() ? parseImporto(v.importo) : null,
    cig: testo(v.cig)?.toUpperCase() ?? null,
    cup: testo(v.cup)?.toUpperCase() ?? null,
    data_inizio: v.data_inizio || null,
    data_fine: v.data_fine || null,
    protocollo_collegato: testo(v.protocollo_collegato),
    note: testo(v.note),
  };
}

interface ContrattoFormProps {
  contratto?: Contratto;
  /** Mostra il caricamento allegati (solo in inserimento) */
  conAllegati?: boolean;
  salvataggio: boolean;
  etichettaSalva: string;
  onAnnulla: () => void;
  onSalva: (dati: DatiContratto, files: File[]) => void;
}

export function ContrattoForm({
  contratto, conAllegati, salvataggio, etichettaSalva, onAnnulla, onSalva,
}: ContrattoFormProps) {
  const [valori, setValori] = useState<ValoriForm>(() => valoriDa(contratto));
  const [toccati, setToccati] = useState<Partial<Record<keyof ValoriForm, boolean>>>({});
  const [files, setFiles] = useState<File[]>([]);
  const annoCorrente = new Date().getFullYear();

  // Validazione in tempo reale: errori mostrati sui campi già toccati
  const errori: Errori = useMemo(() => {
    const esito = schema.safeParse(valori);
    if (esito.success) return {};
    const e: Errori = {};
    for (const issue of esito.error.issues) {
      const campo = issue.path[0] as keyof ValoriForm;
      if (!e[campo]) e[campo] = issue.message;
    }
    return e;
  }, [valori]);

  const imposta = <K extends keyof ValoriForm>(campo: K, valore: ValoriForm[K]) => {
    setValori((prev) => ({ ...prev, [campo]: valore }));
    setToccati((prev) => ({ ...prev, [campo]: true }));
  };

  const errore = (campo: keyof ValoriForm) =>
    toccati[campo] && errori[campo] ? (
      <p className="text-xs text-red-600">{errori[campo]}</p>
    ) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errori).length > 0) {
      // Mostra tutti gli errori residui
      setToccati(Object.fromEntries(Object.keys(valori).map((k) => [k, true])));
      return;
    }
    onSalva(inDatiContratto(valori), files);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Dati del contratto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dati del Contratto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tipo_contratto">Tipologia</Label>
              <Select value={valori.tipo_contratto} onValueChange={(v) => imposta('tipo_contratto', v as TipoContratto)}>
                <SelectTrigger id="tipo_contratto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_TIPO_CONTRATTO) as TipoContratto[]).map((t) => (
                    <SelectItem key={t} value={t}>{LABEL_TIPO_CONTRATTO[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forma_stipula">Forma di stipula</Label>
              <Select value={valori.forma_stipula} onValueChange={(v) => imposta('forma_stipula', v as ValoriForm['forma_stipula'])}>
                <SelectTrigger id="forma_stipula"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>— Non indicata —</SelectItem>
                  {(Object.keys(LABEL_FORMA_STIPULA) as FormaStipula[]).map((f) => (
                    <SelectItem key={f} value={f}>{LABEL_FORMA_STIPULA[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data_stipula">Data di stipula</Label>
              <Input id="data_stipula" type="date" value={valori.data_stipula}
                onChange={(e) => imposta('data_stipula', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oggetto">Oggetto <span className="text-red-500">*</span></Label>
            <Textarea id="oggetto" rows={3} value={valori.oggetto}
              placeholder="Es. Affidamento del servizio di assistenza tecnica al PSL..."
              onChange={(e) => imposta('oggetto', e.target.value)}
              onBlur={() => setToccati((p) => ({ ...p, oggetto: true }))} />
            {errore('oggetto')}
          </div>
          {contratto && (
            <div className="space-y-1.5 sm:w-1/3">
              <Label htmlFor="stato">Stato</Label>
              <Select value={valori.stato} onValueChange={(v) => imposta('stato', v as StatoContratto)}>
                <SelectTrigger id="stato"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_STATO_CONTRATTO) as StatoContratto[]).map((s) => (
                    <SelectItem key={s} value={s}>{LABEL_STATO_CONTRATTO[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contraente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contraente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="contraente_nome">Nome / Ragione sociale <span className="text-red-500">*</span></Label>
            <Input id="contraente_nome" value={valori.contraente_nome} placeholder="Es. Studio Rossi S.r.l."
              onChange={(e) => imposta('contraente_nome', e.target.value)}
              onBlur={() => setToccati((p) => ({ ...p, contraente_nome: true }))} />
            {errore('contraente_nome')}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contraente_cf">Codice fiscale / Partita IVA</Label>
              <Input id="contraente_cf" value={valori.contraente_codice_fiscale} placeholder="Es. 01234567890"
                onChange={(e) => imposta('contraente_codice_fiscale', e.target.value)} />
              {errore('contraente_codice_fiscale')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contraente_pec">PEC</Label>
              <Input id="contraente_pec" type="email" value={valori.contraente_pec} placeholder="contraente@pec.it"
                onChange={(e) => imposta('contraente_pec', e.target.value)} />
              {errore('contraente_pec')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Importo, durata e riferimenti */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importo, durata e riferimenti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="importo">Importo (€, IVA esclusa)</Label>
              <Input id="importo" inputMode="decimal" value={valori.importo} placeholder="Es. 12500,00"
                onChange={(e) => imposta('importo', e.target.value)} />
              {errore('importo')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cig">CIG</Label>
              <Input id="cig" value={valori.cig} maxLength={10} placeholder="10 caratteri"
                onChange={(e) => imposta('cig', e.target.value.toUpperCase())} />
              {errore('cig')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cup">CUP</Label>
              <Input id="cup" value={valori.cup} maxLength={15} placeholder="15 caratteri"
                onChange={(e) => imposta('cup', e.target.value.toUpperCase())} />
              {errore('cup')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="data_inizio">Data inizio</Label>
              <Input id="data_inizio" type="date" value={valori.data_inizio}
                onChange={(e) => imposta('data_inizio', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data_fine">Data fine / scadenza</Label>
              <Input id="data_fine" type="date" value={valori.data_fine}
                onChange={(e) => imposta('data_fine', e.target.value)} />
              {errore('data_fine')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="protocollo_collegato">Protocollo collegato</Label>
              <Input id="protocollo_collegato" value={valori.protocollo_collegato}
                placeholder={`Es. U/0042/${annoCorrente}`}
                onChange={(e) => imposta('protocollo_collegato', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note interne</Label>
            <Textarea id="note" rows={2} value={valori.note} placeholder="Note aggiuntive (uso interno)..."
              onChange={(e) => imposta('note', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {conAllegati && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4" />
              Allegati (contratto firmato, capitolato, ...)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AllegatiUpload files={files} onChange={setFiles} disabled={salvataggio} />
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 pb-6">
        <Button type="button" variant="outline" onClick={onAnnulla} disabled={salvataggio}>
          Annulla
        </Button>
        <Button type="submit" disabled={salvataggio} className="flex-1">
          {salvataggio ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Salvataggio in corso...
            </span>
          ) : etichettaSalva}
        </Button>
      </div>
    </form>
  );
}
