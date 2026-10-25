// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UFFICI } from '@/lib/utils';
import { aggiornaFascicolo, creaFascicolo, getTitolario, messaggioErroreFascicolo } from '@/hooks/useFascicoli';
import type { DatiFascicolo, Fascicolo, VoceTitolario } from '@/types';

// Radix Select non accetta value="": valore sentinella per "nessuna scelta"
const NESSUNO = '__nessuno__';

const oggi = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-GG nel fuso locale

const schema = z.object({
  oggetto: z.string().trim().min(3, "L'oggetto deve avere almeno 3 caratteri"),
  data_apertura: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data di apertura non valida')
    .refine((v) => v <= oggi(), 'La data di apertura non può essere futura'),
  riferimento_esterno: z.string().trim().max(100, 'Massimo 100 caratteri'),
});

type Errori = Partial<Record<'oggetto' | 'data_apertura' | 'riferimento_esterno', string>>;

interface FascicoloFormProps {
  aperto: boolean;
  onChiudi: () => void;
  /** Fascicolo da modificare; assente = nuovo fascicolo */
  fascicolo?: Fascicolo;
  onSalvato: (fascicolo: Fascicolo) => void;
}

export function FascicoloForm({ aperto, onChiudi, fascicolo, onSalvato }: FascicoloFormProps) {
  const [titolario, setTitolario] = useState<VoceTitolario[]>([]);
  const [dati, setDati] = useState<DatiFascicolo>(() => vuoto());
  const [errori, setErrori] = useState<Errori>({});
  const [salvataggio, setSalvataggio] = useState(false);

  function vuoto(): DatiFascicolo {
    return { oggetto: '', titolario_id: null, responsabile: null, ufficio: null, data_apertura: oggi(), riferimento_esterno: null, note: null };
  }

  useEffect(() => {
    if (!aperto) return;
    setErrori({});
    setDati(fascicolo
      ? {
          oggetto: fascicolo.oggetto, titolario_id: fascicolo.titolario_id, responsabile: fascicolo.responsabile,
          ufficio: fascicolo.ufficio, data_apertura: fascicolo.data_apertura,
          riferimento_esterno: fascicolo.riferimento_esterno, note: fascicolo.note,
        }
      : vuoto());
    getTitolario()
      .then(setTitolario)
      .catch((err: unknown) => {
        console.error(err);
        toast.error('Impossibile caricare il titolario');
      });
  }, [aperto, fascicolo]);

  const imposta = <K extends keyof DatiFascicolo>(campo: K, valore: DatiFascicolo[K]) => {
    setDati((prev) => ({ ...prev, [campo]: valore }));
    // Validazione in tempo reale del solo campo modificato
    if (campo in schema.shape) {
      const esito = schema.shape[campo as keyof typeof schema.shape].safeParse(valore ?? '');
      setErrori((prev) => ({ ...prev, [campo]: esito.success ? undefined : esito.error.issues[0].message }));
    }
  };

  const salva = async () => {
    const esito = schema.safeParse({
      oggetto: dati.oggetto,
      data_apertura: dati.data_apertura,
      riferimento_esterno: dati.riferimento_esterno ?? '',
    });
    if (!esito.success) {
      const nuovi: Errori = {};
      for (const issue of esito.error.issues) nuovi[issue.path[0] as keyof Errori] ??= issue.message;
      setErrori(nuovi);
      return;
    }
    const pulito = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const payload: DatiFascicolo = {
      ...dati,
      oggetto: dati.oggetto.trim(),
      responsabile: pulito(dati.responsabile),
      riferimento_esterno: pulito(dati.riferimento_esterno),
      note: pulito(dati.note),
    };
    setSalvataggio(true);
    try {
      const salvato = fascicolo ? await aggiornaFascicolo(fascicolo.id, payload) : await creaFascicolo(payload);
      toast.success(fascicolo ? 'Fascicolo aggiornato' : `Fascicolo ${salvato.numero_completo} creato`);
      onSalvato(salvato);
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante il salvataggio del fascicolo'));
    } finally {
      setSalvataggio(false);
    }
  };

  const vociAttive = titolario.filter((v) => v.attivo || v.id === dati.titolario_id);

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fascicolo ? `Modifica fascicolo ${fascicolo.numero_completo}` : 'Nuovo fascicolo'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="f-oggetto">Oggetto *</Label>
            <Input id="f-oggetto" value={dati.oggetto} placeholder="Es. Bando SRD07 2026 — domanda Rossi"
              onChange={(e) => imposta('oggetto', e.target.value)} />
            {errori.oggetto && <p className="text-xs text-red-600">{errori.oggetto}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Classificazione (titolario)</Label>
            <Select value={dati.titolario_id ?? NESSUNO} onValueChange={(v) => imposta('titolario_id', v === NESSUNO ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>Nessuna</SelectItem>
                {vociAttive.map((v) => <SelectItem key={v.id} value={v.id}>{v.codice} — {v.descrizione}</SelectItem>)}
              </SelectContent>
            </Select>
            {titolario.length === 0 && (
              <p className="text-xs text-gray-500">Il titolario è vuoto: l'amministratore può compilarlo da Amministrazione → Titolario.</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="f-responsabile">Responsabile</Label>
              <Input id="f-responsabile" value={dati.responsabile ?? ''} placeholder="Es. RUP"
                onChange={(e) => imposta('responsabile', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ufficio</Label>
              <Select value={dati.ufficio ?? NESSUNO} onValueChange={(v) => imposta('ufficio', v === NESSUNO ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                  {UFFICI.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="f-apertura">Data di apertura *</Label>
              <Input id="f-apertura" type="date" max={oggi()} value={dati.data_apertura}
                disabled={!!fascicolo}
                onChange={(e) => imposta('data_apertura', e.target.value)} />
              {errori.data_apertura && <p className="text-xs text-red-600">{errori.data_apertura}</p>}
              {!fascicolo && <p className="text-xs text-gray-500">L'anno della data determina la numerazione (F/NNNN/anno).</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-rif">Riferimento esterno</Label>
              <Input id="f-rif" value={dati.riferimento_esterno ?? ''} placeholder="ID domanda, CUP, codice progetto"
                onChange={(e) => imposta('riferimento_esterno', e.target.value)} />
              {errori.riferimento_esterno && <p className="text-xs text-red-600">{errori.riferimento_esterno}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-note">Note</Label>
            <Textarea id="f-note" rows={3} value={dati.note ?? ''} onChange={(e) => imposta('note', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={salvataggio}>Annulla</Button>
          <Button onClick={salva} disabled={salvataggio} className="bg-[#003399] hover:bg-[#002277]">
            {salvataggio ? 'Salvataggio…' : fascicolo ? 'Salva modifiche' : 'Crea fascicolo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
