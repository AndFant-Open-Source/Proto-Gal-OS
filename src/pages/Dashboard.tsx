// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus, TrendingUp, TrendingDown, FileText, Calendar, Inbox } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { NOME_ENTE } from '@/lib/ente';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatoBadge } from '@/components/StatoBadge';
import { formatData, MESI_IT } from '@/lib/utils';
import type { Protocollo, StatisticheDashboard } from '@/types';

const annoCorrente = new Date().getFullYear();

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatisticheDashboard | null>(null);
  const [ultimi, setUltimi] = useState<Protocollo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pec, setPec] = useState<{ daProtocollare: number; protocollateAnno: number } | null>(null);

  useEffect(() => {
    const carica = async () => {
      setLoading(true);
      try {
        const oggi = new Date();
        const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).toISOString();
        const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString();

        // Statistiche della serie ordinaria; le PEC hanno il loro riquadro
        const conta = () => supabase.from('protocollo_registro')
          .select('*', { count: 'exact', head: true }).eq('registro', 'ordinario');

        const [{ count: totOggi }, { count: totMese }, { count: totAnno }] = await Promise.all([
          conta().gte('data_registrazione', inizioOggi).eq('anno', annoCorrente),
          conta().gte('data_registrazione', inizioMese).eq('anno', annoCorrente),
          conta().eq('anno', annoCorrente),
        ]);

        const [{ count: arrivi }, { count: partenze }] = await Promise.all([
          conta().eq('anno', annoCorrente).eq('tipo_flusso', 'arrivo'),
          conta().eq('anno', annoCorrente).eq('tipo_flusso', 'partenza'),
        ]);

        // Dati per mese
        const perMese = await Promise.all(
          Array.from({ length: 12 }, (_, i) => i).map(async (mese) => {
            const inizio = new Date(annoCorrente, mese, 1).toISOString();
            const fine = new Date(annoCorrente, mese + 1, 0, 23, 59, 59).toISOString();
            const [{ count: a }, { count: p }] = await Promise.all([
              conta().eq('anno', annoCorrente).eq('tipo_flusso', 'arrivo').gte('data_registrazione', inizio).lte('data_registrazione', fine),
              conta().eq('anno', annoCorrente).eq('tipo_flusso', 'partenza').gte('data_registrazione', inizio).lte('data_registrazione', fine),
            ]);
            return { mese: MESI_IT[mese], arrivi: a ?? 0, partenze: p ?? 0 };
          })
        );

        setStats({
          totale_oggi: totOggi ?? 0,
          totale_mese: totMese ?? 0,
          totale_anno: totAnno ?? 0,
          arrivi_anno: arrivi ?? 0,
          partenze_anno: partenze ?? 0,
          per_mese: perMese,
        });

        // Ultimi 5 protocolli
        const ultimiQ = supabase
          .from('protocollo_registro')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);
        const { data: ultimiData } = await ultimiQ;
        setUltimi((ultimiData ?? []) as Protocollo[]);

        // Protocollo PEC: coda e PEC protocollate nell'anno (il riquadro compare solo se usato)
        const [coda, pecAnno] = await Promise.all([
          supabase.from('protocollo_pec_messaggi').select('id', { count: 'exact', head: true })
            .eq('tipo', 'messaggio').in('stato', ['da_verificare', 'pronto', 'anomalia']),
          supabase.from('protocollo_registro').select('id', { count: 'exact', head: true })
            .eq('registro', 'pec').eq('anno', annoCorrente),
        ]);
        if (!coda.error && !pecAnno.error) setPec({ daProtocollare: coda.count ?? 0, protocollateAnno: pecAnno.count ?? 0 });
      } catch {
        toast.error('Errore nel caricamento della dashboard');
      } finally {
        setLoading(false);
      }
    };
    carica();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Intestazione */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {NOME_ENTE} — {annoCorrente}
          </p>
        </div>
        <Button onClick={() => navigate('/nuovo')}>
          <FilePlus className="mr-2 h-4 w-4" />
          Nuovo Protocollo
        </Button>
      </div>

      {pec && (pec.daProtocollare > 0 || pec.protocollateAnno > 0) && (
        <button
          type="button"
          onClick={() => navigate('/pec/coda')}
          className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-purple-200 bg-purple-50 px-5 py-3 text-left text-sm text-purple-900 hover:bg-purple-100"
        >
          <Inbox className="h-5 w-5 text-purple-700" />
          <span><strong className="text-lg">{pec.daProtocollare}</strong> PEC da protocollare</span>
          <span><strong>{pec.protocollateAnno}</strong> PEC protocollate nel {annoCorrente} (serie P-A / P-U)</span>
        </button>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Oggi</p>
                <p className="mt-1 text-3xl font-bold text-[#003399]">{stats?.totale_oggi ?? 0}</p>
              </div>
              <Calendar className="h-5 w-5 text-[#003399] opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Questo mese</p>
                <p className="mt-1 text-3xl font-bold text-[#003399]">{stats?.totale_mese ?? 0}</p>
              </div>
              <FileText className="h-5 w-5 text-[#003399] opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Anno {annoCorrente}</p>
                <p className="mt-1 text-3xl font-bold text-[#003399]">{stats?.totale_anno ?? 0}</p>
              </div>
              <FileText className="h-5 w-5 text-[#003399] opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Arrivi</p>
                <p className="mt-1 text-3xl font-bold text-green-700">{stats?.arrivi_anno ?? 0}</p>
              </div>
              <TrendingDown className="h-5 w-5 text-green-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Partenze</p>
                <p className="mt-1 text-3xl font-bold text-orange-700">{stats?.partenze_anno ?? 0}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-orange-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Grafico */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Documenti per mese — {annoCorrente}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats?.per_mese ?? []} barSize={14}>
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

        {/* Ultimi protocolli */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ultimi registrati</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {ultimi.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-400">Nessun protocollo</p>
            ) : (
              <ul className="divide-y">
                {ultimi.map((p) => (
                  <li
                    key={p.id}
                    className="cursor-pointer px-5 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => navigate(`/protocollo/${p.id}`)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-[#003399]">
                        {p.numero_completo}
                      </span>
                      <StatoBadge stato={p.stato} />
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-600">{p.oggetto}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{formatData(p.data_registrazione)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
