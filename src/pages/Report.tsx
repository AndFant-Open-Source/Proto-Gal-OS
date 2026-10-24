// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExportButton } from '@/components/ExportButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESI_IT, LABEL_CANALE } from '@/lib/utils';
import type { Canale } from '@/types';

const annoCorrente = new Date().getFullYear();
const ANNI = Array.from({ length: 5 }, (_, i) => annoCorrente - i);

const COLORI_CANALE: Record<Canale, string> = {
  pec: '#7c3aed',
  email: '#2563eb',
  cartaceo: '#6b7280',
  digitale: '#0d9488',
};

interface StatPerMese { mese: string; arrivi: number; partenze: number }
interface StatPerCanale { canale: string; totale: number }
interface StatPerUfficio { ufficio: string; totale: number }
interface StatPerStato { stato: string; totale: number }

export default function Report() {
  const [anno, setAnno] = useState(annoCorrente);
  const [loading, setLoading] = useState(true);
  const [perMese, setPerMese] = useState<StatPerMese[]>([]);
  const [perCanale, setPerCanale] = useState<StatPerCanale[]>([]);
  const [perUfficio, setPerUfficio] = useState<StatPerUfficio[]>([]);
  const [perStato, setPerStato] = useState<StatPerStato[]>([]);

  useEffect(() => {
    // Query di base sul registro dell'anno scelto
    const conta = () => {
      return supabase.from('protocollo_registro').select('*', { count: 'exact', head: true }).eq('anno', anno);
    };
    const uffici = () => {
      return supabase.from('protocollo_registro').select('ufficio_assegnatario').eq('anno', anno).not('ufficio_assegnatario', 'is', null);
    };
    const conteggio = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };

    const carica = async () => {
      setLoading(true);
      try {
        // Per mese
        const datiMese = await Promise.all(
          Array.from({ length: 12 }, (_, i) => i).map(async (mese) => {
            const inizio = new Date(anno, mese, 1).toISOString();
            const fine = new Date(anno, mese + 1, 0, 23, 59, 59).toISOString();
            const [a, p] = await Promise.all([
              conteggio(conta().eq('tipo_flusso', 'arrivo').gte('data_registrazione', inizio).lte('data_registrazione', fine)),
              conteggio(conta().eq('tipo_flusso', 'partenza').gte('data_registrazione', inizio).lte('data_registrazione', fine)),
            ]);
            return { mese: MESI_IT[mese], arrivi: a, partenze: p };
          })
        );
        setPerMese(datiMese);

        // Per canale
        const canali: Canale[] = ['pec', 'email', 'cartaceo', 'digitale'];
        const datiCanale = await Promise.all(
          canali.map(async (c) => ({
            canale: LABEL_CANALE[c],
            totale: await conteggio(conta().eq('canale', c)),
          }))
        );
        setPerCanale(datiCanale.filter((d) => d.totale > 0));

        // Per stato
        const stati = ['ricevuto', 'in_lavorazione', 'evaso', 'archiviato'];
        const datiStato = await Promise.all(
          stati.map(async (s) => ({
            stato: s.replace('_', ' '),
            totale: await conteggio(conta().eq('stato', s)),
          }))
        );
        setPerStato(datiStato.filter((d) => d.totale > 0));

        // Per ufficio — ottieni dalla tabella
        const { data: ufficiData, error: ufficiError } = await uffici();
        if (ufficiError) throw ufficiError;

        const conteggioUffici: Record<string, number> = {};
        (ufficiData ?? []).forEach((r: { ufficio_assegnatario: string | null }) => {
          if (r.ufficio_assegnatario) {
            conteggioUffici[r.ufficio_assegnatario] = (conteggioUffici[r.ufficio_assegnatario] ?? 0) + 1;
          }
        });
        setPerUfficio(
          Object.entries(conteggioUffici)
            .map(([ufficio, totale]) => ({ ufficio, totale }))
            .sort((a, b) => b.totale - a.totale)
        );
      } catch {
        toast.error('Errore nel caricamento dei report');
      } finally {
        setLoading(false);
      }
    };
    carica();
  }, [anno]);

  const totaleAnno = perMese.reduce((acc, m) => acc + m.arrivi + m.partenze, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Report & Statistiche</h1>
          <p className="text-sm text-gray-500">Analisi del registro di protocollo</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={anno.toString()} onValueChange={(v) => setAnno(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANNI.map((a) => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <ExportButton anno={anno} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase text-gray-500">Totale {anno}</p>
                <p className="mt-1 text-3xl font-bold text-[#003399]">{totaleAnno}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase text-gray-500">Arrivi</p>
                <p className="mt-1 text-3xl font-bold text-green-700">
                  {perMese.reduce((acc, m) => acc + m.arrivi, 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase text-gray-500">Partenze</p>
                <p className="mt-1 text-3xl font-bold text-orange-700">
                  {perMese.reduce((acc, m) => acc + m.partenze, 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase text-gray-500">Evasi</p>
                <p className="mt-1 text-3xl font-bold text-emerald-600">
                  {perStato.find((s) => s.stato === 'evaso')?.totale ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Grafico per mese */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Andamento mensile {anno}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={perMese} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="arrivi" name="Arrivi" fill="#009246" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="partenze" name="Partenze" fill="#CE2B37" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Per canale */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documenti per canale</CardTitle>
              </CardHeader>
              <CardContent>
                {perCanale.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Nessun dato</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={perCanale}
                        dataKey="totale"
                        nameKey="canale"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        label={({ canale, percent }) => `${canale} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {perCanale.map((entry, index) => {
                          const canaleKey = (['pec', 'email', 'cartaceo', 'digitale'] as Canale[]).find(
                            (c) => LABEL_CANALE[c] === entry.canale
                          );
                          return (
                            <Cell
                              key={`cell-${index}`}
                              fill={canaleKey ? COLORI_CANALE[canaleKey] : '#999'}
                            />
                          );
                        })}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Per stato */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documenti per stato</CardTitle>
              </CardHeader>
              <CardContent>
                {perStato.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Nessun dato</p>
                ) : (
                  <ul className="space-y-3">
                    {perStato.map((s) => (
                      <li key={s.stato}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize">{s.stato}</span>
                          <span className="font-semibold">{s.totale}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-[#003399]"
                            style={{ width: `${totaleAnno > 0 ? (s.totale / totaleAnno) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Per ufficio */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top uffici assegnatari</CardTitle>
              </CardHeader>
              <CardContent>
                {perUfficio.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Nessun dato</p>
                ) : (
                  <ul className="space-y-3">
                    {perUfficio.slice(0, 7).map((u) => (
                      <li key={u.ufficio}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="truncate">{u.ufficio}</span>
                          <span className="font-semibold ml-2">{u.totale}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-[#009246]"
                            style={{ width: `${perUfficio[0]?.totale > 0 ? (u.totale / perUfficio[0].totale) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
