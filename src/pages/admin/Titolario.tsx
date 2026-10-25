// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useState } from 'react';
import { Edit2, FolderTree, Plus } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getTitolario, messaggioErroreFascicolo, salvaVoceTitolario } from '@/hooks/useFascicoli';
import type { VoceTitolario } from '@/types';

const NESSUNO = '__nessuno__';

const schemaVoce = z.object({
  codice: z.string().trim().regex(/^[0-9A-Za-z]+(\.[0-9A-Za-z]+)*$/, 'Codice non valido: usare numeri o lettere separati da punti (es. 2.1)'),
  descrizione: z.string().trim().min(2, 'La descrizione è obbligatoria'),
});

type Bozza = Pick<VoceTitolario, 'codice' | 'descrizione' | 'padre_id' | 'attivo'>;

/** Profondità della voce dal numero di segmenti del codice (2.1.3 → 2) */
const livello = (codice: string) => codice.split('.').length - 1;

export default function Titolario() {
  const [voci, setVoci] = useState<VoceTitolario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modifica, setModifica] = useState<{ id?: string; bozza: Bozza } | null>(null);
  const [errori, setErrori] = useState<Partial<Record<'codice' | 'descrizione', string>>>({});
  const [salvataggio, setSalvataggio] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setVoci(await getTitolario());
    } catch (err: unknown) {
      console.error(err);
      toast.error('Errore nel caricamento del titolario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  const apri = (voce?: VoceTitolario) => {
    setErrori({});
    setModifica(voce
      ? { id: voce.id, bozza: { codice: voce.codice, descrizione: voce.descrizione, padre_id: voce.padre_id, attivo: voce.attivo } }
      : { bozza: { codice: '', descrizione: '', padre_id: null, attivo: true } });
  };

  const imposta = <K extends keyof Bozza>(campo: K, valore: Bozza[K]) => {
    if (!modifica) return;
    setModifica({ ...modifica, bozza: { ...modifica.bozza, [campo]: valore } });
    if (campo === 'codice' || campo === 'descrizione') {
      const esito = schemaVoce.shape[campo as 'codice' | 'descrizione'].safeParse(valore);
      setErrori((prev) => ({ ...prev, [campo]: esito.success ? undefined : esito.error.issues[0].message }));
    }
  };

  const salva = async () => {
    if (!modifica) return;
    const esito = schemaVoce.safeParse(modifica.bozza);
    if (!esito.success) {
      const nuovi: typeof errori = {};
      for (const issue of esito.error.issues) nuovi[issue.path[0] as 'codice' | 'descrizione'] ??= issue.message;
      setErrori(nuovi);
      return;
    }
    setSalvataggio(true);
    try {
      await salvaVoceTitolario({ ...modifica.bozza, codice: esito.data.codice, descrizione: esito.data.descrizione }, modifica.id);
      toast.success(modifica.id ? 'Voce aggiornata' : 'Voce aggiunta');
      setModifica(null);
      await carica();
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante il salvataggio della voce'));
    } finally {
      setSalvataggio(false);
    }
  };

  const possibiliPadri = voci.filter((v) => v.id !== modifica?.id);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FolderTree className="h-6 w-6 text-[#003399]" />
            Titolario
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Voci di classificazione dei fascicoli. Le voci in uso non si eliminano: si disattivano e non
            compaiono più tra le scelte.
          </p>
        </div>
        <Button onClick={() => apri()} className="bg-[#003399] hover:bg-[#002277]">
          <Plus className="mr-2 h-4 w-4" />
          Nuova voce
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
          </div>
        ) : voci.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            Titolario vuoto. Esempio: 1 Amministrazione · 2 Bandi e misure · 2.1 SRD07 · 3 Contratti e incarichi
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left">Codice</th>
                <th className="px-5 py-3 text-left">Descrizione</th>
                <th className="px-5 py-3 text-left">Stato</th>
                <th className="px-5 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {voci.map((v) => (
                <tr key={v.id} className={v.attivo ? '' : 'text-gray-400'}>
                  <td className="px-5 py-2.5 font-mono" style={{ paddingLeft: `${1.25 + livello(v.codice) * 1.25}rem` }}>{v.codice}</td>
                  <td className="px-5 py-2.5">{v.descrizione}</td>
                  <td className="px-5 py-2.5 text-xs">{v.attivo ? 'Attiva' : 'Disattivata'}</td>
                  <td className="px-5 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => apri(v)} aria-label={`Modifica ${v.codice}`}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!modifica} onOpenChange={(v) => { if (!v) setModifica(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modifica?.id ? 'Modifica voce' : 'Nuova voce di titolario'}</DialogTitle>
          </DialogHeader>
          {modifica && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="t-codice">Codice *</Label>
                <Input id="t-codice" value={modifica.bozza.codice} placeholder="Es. 2.1" onChange={(e) => imposta('codice', e.target.value)} />
                {errori.codice && <p className="text-xs text-red-600">{errori.codice}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-descrizione">Descrizione *</Label>
                <Input id="t-descrizione" value={modifica.bozza.descrizione} onChange={(e) => imposta('descrizione', e.target.value)} />
                {errori.descrizione && <p className="text-xs text-red-600">{errori.descrizione}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Voce superiore</Label>
                <Select value={modifica.bozza.padre_id ?? NESSUNO} onValueChange={(v) => imposta('padre_id', v === NESSUNO ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNO}>Nessuna (voce principale)</SelectItem>
                    {possibiliPadri.map((v) => <SelectItem key={v.id} value={v.id}>{v.codice} — {v.descrizione}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#003399]" checked={modifica.bozza.attivo}
                  onChange={(e) => imposta('attivo', e.target.checked)} />
                Voce attiva (selezionabile nei fascicoli)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifica(null)} disabled={salvataggio}>Annulla</Button>
            <Button onClick={salva} disabled={salvataggio} className="bg-[#003399] hover:bg-[#002277]">
              {salvataggio ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
