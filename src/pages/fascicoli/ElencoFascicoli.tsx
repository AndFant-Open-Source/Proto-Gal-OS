// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchBar } from '@/components/SearchBar';
import { FascicoloForm } from '@/components/FascicoloForm';
import { StatoFascicoloBadge } from '@/components/StatoFascicoloBadge';
import { useAuth } from '@/hooks/useAuth';
import { getFascicoli, getTitolario } from '@/hooks/useFascicoli';
import { formatData } from '@/lib/utils';
import type { Fascicolo, FiltriFascicolo, StatoFascicolo, VoceTitolario } from '@/types';

const TUTTI = '__tutti__';
const annoCorrente = new Date().getFullYear();
const ANNI = Array.from({ length: 6 }, (_, i) => annoCorrente - i);

export default function ElencoFascicoli() {
  const navigate = useNavigate();
  const { isOperatore } = useAuth();
  const [fascicoli, setFascicoli] = useState<Fascicolo[]>([]);
  const [titolario, setTitolario] = useState<VoceTitolario[]>([]);
  const [filtri, setFiltri] = useState<FiltriFascicolo>({ stato: 'aperto' });
  const [loading, setLoading] = useState(true);
  const [nuovo, setNuovo] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      setFascicoli(await getFascicoli(filtri));
    } catch (err: unknown) {
      console.error(err);
      toast.error('Errore nel caricamento dei fascicoli');
    } finally {
      setLoading(false);
    }
  }, [filtri]);

  useEffect(() => { void carica(); }, [carica]);

  useEffect(() => {
    getTitolario().then(setTitolario).catch((err: unknown) => console.error(err));
  }, []);

  const imposta = (chiave: keyof FiltriFascicolo, valore: string | number | undefined) =>
    setFiltri((prev) => ({ ...prev, [chiave]: valore === TUTTI || valore === '' ? undefined : valore }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FolderOpen className="h-6 w-6 text-[#003399]" />
            Fascicoli
          </h1>
          <p className="text-sm text-gray-500">{fascicoli.length} fascicoli trovati</p>
        </div>
        {isOperatore && (
          <Button onClick={() => setNuovo(true)} className="bg-[#003399] hover:bg-[#002277]">
            <FolderPlus className="mr-2 h-4 w-4" />
            Nuovo fascicolo
          </Button>
        )}
      </div>

      <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <SearchBar
          value={filtri.testo ?? ''}
          onChange={(v) => imposta('testo', v)}
          placeholder="Cerca per numero, oggetto, responsabile, riferimento esterno..."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Anno</label>
            <Select value={filtri.anno?.toString() ?? TUTTI} onValueChange={(v) => imposta('anno', v === TUTTI ? TUTTI : parseInt(v, 10))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti gli anni</SelectItem>
                {ANNI.map((a) => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Stato</label>
            <Select value={filtri.stato ?? TUTTI} onValueChange={(v) => imposta('stato', v as StatoFascicolo)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti</SelectItem>
                <SelectItem value="aperto">Aperti</SelectItem>
                <SelectItem value="chiuso">Chiusi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Classificazione</label>
            <Select value={filtri.titolario_id ?? TUTTI} onValueChange={(v) => imposta('titolario_id', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutte</SelectItem>
                {titolario.map((v) => <SelectItem key={v.id} value={v.id}>{v.codice} — {v.descrizione}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
          </div>
        ) : fascicoli.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">Nessun fascicolo trovato</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Numero</th>
                <th className="px-4 py-3 text-left">Oggetto</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">Classificazione</th>
                <th className="hidden px-4 py-3 text-left lg:table-cell">Responsabile</th>
                <th className="px-4 py-3 text-left">Apertura</th>
                <th className="px-4 py-3 text-right">Documenti</th>
                <th className="px-4 py-3 text-left">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fascicoli.map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer hover:bg-blue-50/50"
                  onClick={() => navigate(`/fascicoli/${f.id}`)}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-[#003399]">{f.numero_completo}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{f.oggetto}</p>
                    {f.riferimento_esterno && <p className="text-xs text-gray-500">Rif. {f.riferimento_esterno}</p>}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                    {f.titolario ? `${f.titolario.codice} ${f.titolario.descrizione}` : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">{f.responsabile ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatData(f.data_apertura)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{f.documenti?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-3"><StatoFascicoloBadge stato={f.stato} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FascicoloForm
        aperto={nuovo}
        onChiudi={() => setNuovo(false)}
        onSalvato={(f) => { setNuovo(false); navigate(`/fascicoli/${f.id}`); }}
      />
    </div>
  );
}
