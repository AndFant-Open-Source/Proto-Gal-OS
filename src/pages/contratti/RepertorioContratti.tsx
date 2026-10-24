// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Filter, X,
  FilePlus, FileSpreadsheet, FileText, Paperclip, ScrollText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/SearchBar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { NOME_ENTE } from '@/lib/ente';
import { useContratti, getTuttiContratti } from '@/hooks/useContratti';
import {
  formatData, formatImporto, LABEL_TIPO_CONTRATTO, LABEL_STATO_CONTRATTO, COLORE_STATO_CONTRATTO,
  LABEL_FORMA_STIPULA,
} from '@/lib/utils';
import { toast } from 'sonner';
import type { Contratto, FiltriContratto, StatoContratto, TipoContratto } from '@/types';

const annoCorrente = new Date().getFullYear();
const ANNI = Array.from({ length: 5 }, (_, i) => annoCorrente - i);
// Radix Select non accetta value="": sentinella per "Tutti"
const TUTTI = '__tutti__';

type Ordinamento = { colonna: string; ascendente: boolean };

/** Scadenza: evidenzia i contratti in corso scaduti o in scadenza entro 30 giorni */
function Scadenza({ c }: { c: Contratto }) {
  if (!c.data_fine) return <span className="text-gray-400">—</span>;
  const giorni = Math.ceil((new Date(c.data_fine).getTime() - Date.now()) / 86_400_000);
  const inCorso = c.stato === 'in_corso';
  const classe = inCorso && giorni < 0
    ? 'font-semibold text-red-600'
    : inCorso && giorni <= 30 ? 'font-semibold text-amber-600' : 'text-gray-600';
  const titolo = inCorso && giorni < 0
    ? 'Scaduto'
    : inCorso && giorni <= 30 ? `Scade tra ${giorni} giorni` : undefined;
  return <span className={classe} title={titolo}>{formatData(c.data_fine)}</span>;
}

function Th({ colonna, label, ordinamento, onOrdina }: {
  colonna: string; label: string; ordinamento: Ordinamento; onOrdina: (c: string) => void;
}) {
  const attivo = ordinamento.colonna === colonna;
  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-100"
      onClick={() => onOrdina(colonna)}
    >
      <div className="flex items-center gap-1">
        {label}
        {attivo
          ? (ordinamento.ascendente ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </div>
    </th>
  );
}

export default function RepertorioContratti() {
  const navigate = useNavigate();
  const { isOperatore } = useAuth();
  const { contratti, totale, loading, errore, carica, pageSize } = useContratti();
  const [pagina, setPagina] = useState(0);
  const [ordinamento, setOrdinamento] = useState<Ordinamento>({ colonna: 'numero', ascendente: false });
  const [filtri, setFiltri] = useState<FiltriContratto>({ anno: annoCorrente });
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const [esportando, setEsportando] = useState(false);

  const aggiorna = useCallback(() => {
    carica(filtri, pagina, ordinamento);
  }, [carica, filtri, pagina, ordinamento]);

  useEffect(() => { aggiorna(); }, [aggiorna]);

  const handleFiltro = <K extends keyof FiltriContratto>(chiave: K, valore: string | number) => {
    setFiltri((prev) => ({ ...prev, [chiave]: valore === TUTTI || valore === '' ? undefined : valore }));
    setPagina(0);
  };

  const handleOrdina = (colonna: string) => {
    setOrdinamento((prev) => ({ colonna, ascendente: prev.colonna === colonna ? !prev.ascendente : false }));
    setPagina(0);
  };

  const filtriAttivi = (Object.keys(filtri) as (keyof FiltriContratto)[])
    .filter((k) => (k === 'anno' ? filtri.anno !== annoCorrente : Boolean(filtri[k])))
    .length;
  const totalePagine = Math.ceil(totale / pageSize);

  // ── Export ────────────────────────────────────────────────────────────────
  const esportaExcel = async () => {
    setEsportando(true);
    try {
      const dati = await getTuttiContratti(filtri.anno);
      const righe = dati.map((c) => ({
        'Numero': c.numero_completo,
        'Data repertorio': formatData(c.data_repertorio),
        'Data stipula': c.data_stipula ? formatData(c.data_stipula) : '',
        'Tipologia': LABEL_TIPO_CONTRATTO[c.tipo_contratto],
        'Forma': c.forma_stipula ? LABEL_FORMA_STIPULA[c.forma_stipula] : '',
        'Oggetto': c.oggetto,
        'Contraente': c.contraente_nome,
        'CF / P.IVA': c.contraente_codice_fiscale ?? '',
        'Importo (€)': c.importo ?? '',
        'CIG': c.cig ?? '',
        'CUP': c.cup ?? '',
        'Inizio': c.data_inizio ? formatData(c.data_inizio) : '',
        'Fine': c.data_fine ? formatData(c.data_fine) : '',
        'Stato': LABEL_STATO_CONTRATTO[c.stato],
        'Protocollo collegato': c.protocollo_collegato ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(righe);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Repertorio');
      XLSX.writeFile(wb, `repertorio_contratti_${filtri.anno ?? 'tutti'}.xlsx`);
      toast.success('Export Excel completato');
    } catch (e) {
      console.error(e);
      toast.error('Errore durante l\'export Excel');
    } finally {
      setEsportando(false);
    }
  };

  const esportaPDF = async () => {
    setEsportando(true);
    try {
      const dati = await getTuttiContratti(filtri.anno);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(0, 51, 153);
      doc.text(`${NOME_ENTE} — Repertorio Contratti${filtri.anno ? ` ${filtri.anno}` : ''}`, 14, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Generato il ${formatData(new Date().toISOString(), true)}`, 14, 21);
      autoTable(doc, {
        startY: 26,
        head: [['Numero', 'Data rep.', 'Tipologia', 'Oggetto', 'Contraente', 'Importo', 'CIG', 'Scadenza', 'Stato']],
        body: dati.map((c) => [
          c.numero_completo,
          formatData(c.data_repertorio),
          LABEL_TIPO_CONTRATTO[c.tipo_contratto],
          c.oggetto.length > 60 ? `${c.oggetto.substring(0, 57)}...` : c.oggetto,
          c.contraente_nome,
          formatImporto(c.importo),
          c.cig ?? '',
          c.data_fine ? formatData(c.data_fine) : '',
          LABEL_STATO_CONTRATTO[c.stato],
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 255] },
      });
      doc.save(`repertorio_contratti_${filtri.anno ?? 'tutti'}.pdf`);
      toast.success('Export PDF completato');
    } catch (e) {
      console.error(e);
      toast.error('Errore durante l\'export PDF');
    } finally {
      setEsportando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ScrollText className="h-6 w-6 text-[#003399]" />
            Repertorio Contratti
          </h1>
          <p className="text-sm text-gray-500">
            {totale} contratti trovati — numerazione C/0001/{filtri.anno ?? annoCorrente}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={esportaExcel} disabled={esportando}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={esportaPDF} disabled={esportando}>
            <FileText className="mr-2 h-4 w-4 text-red-600" />
            PDF
          </Button>
          {isOperatore && (
            <Button size="sm" onClick={() => navigate('/contratti/nuovo')}>
              <FilePlus className="mr-2 h-4 w-4" />
              Nuovo contratto
            </Button>
          )}
        </div>
      </div>

      {/* Ricerca e filtri */}
      <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex gap-3">
          <div className="flex-1">
            <SearchBar
              value={filtri.testo ?? ''}
              onChange={(v) => handleFiltro('testo', v)}
              placeholder="Cerca per numero, oggetto, contraente, CIG, CUP..."
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setMostraFiltri(!mostraFiltri)} className="relative">
            <Filter className="mr-2 h-4 w-4" />
            Filtri
            {filtriAttivi > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#003399] text-xs text-white">
                {filtriAttivi}
              </span>
            )}
          </Button>
          {filtriAttivi > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setFiltri({ anno: annoCorrente }); setPagina(0); }}>
              <X className="mr-1 h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        {mostraFiltri && (
          <div className="grid grid-cols-1 gap-3 border-t pt-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Anno</label>
              <Select
                value={filtri.anno?.toString() ?? TUTTI}
                onValueChange={(v) => handleFiltro('anno', v === TUTTI ? TUTTI : parseInt(v, 10))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti gli anni</SelectItem>
                  {ANNI.map((a) => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Tipologia</label>
              <Select value={filtri.tipo_contratto ?? TUTTI} onValueChange={(v) => handleFiltro('tipo_contratto', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutte</SelectItem>
                  {(Object.keys(LABEL_TIPO_CONTRATTO) as TipoContratto[]).map((t) => (
                    <SelectItem key={t} value={t}>{LABEL_TIPO_CONTRATTO[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Stato</label>
              <Select value={filtri.stato ?? TUTTI} onValueChange={(v) => handleFiltro('stato', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti</SelectItem>
                  {(Object.keys(LABEL_STATO_CONTRATTO) as StatoContratto[]).map((s) => (
                    <SelectItem key={s} value={s}>{LABEL_STATO_CONTRATTO[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Tabella */}
      <div className="rounded-lg border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
            <span className="ml-3 text-sm">Caricamento...</span>
          </div>
        ) : errore ? (
          <p className="py-16 text-center text-sm text-red-600">{errore}</p>
        ) : contratti.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ScrollText className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">Nessun contratto nel repertorio</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th colonna="numero" label="Numero" ordinamento={ordinamento} onOrdina={handleOrdina} />
                  <Th colonna="data_repertorio" label="Data" ordinamento={ordinamento} onOrdina={handleOrdina} />
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Tipologia</th>
                  <Th colonna="oggetto" label="Oggetto" ordinamento={ordinamento} onOrdina={handleOrdina} />
                  <Th colonna="contraente_nome" label="Contraente" ordinamento={ordinamento} onOrdina={handleOrdina} />
                  <Th colonna="importo" label="Importo" ordinamento={ordinamento} onOrdina={handleOrdina} />
                  <Th colonna="data_fine" label="Scadenza" ordinamento={ordinamento} onOrdina={handleOrdina} />
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contratti.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition-colors hover:bg-blue-50"
                    onClick={() => navigate(`/contratti/${c.id}`)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-[#003399]">
                      <span className="inline-flex items-center gap-1.5">
                        {c.numero_completo}
                        {(c.protocollo_contratti_allegati?.length ?? 0) > 0 && (
                          <Paperclip className="h-3.5 w-3.5 text-gray-400" aria-label="Con allegati" />
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatData(c.data_repertorio)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{LABEL_TIPO_CONTRATTO[c.tipo_contratto]}</td>
                    <td className="max-w-xs px-4 py-3"><span className="line-clamp-2">{c.oggetto}</span></td>
                    <td className="max-w-[200px] px-4 py-3 text-gray-700"><span className="block truncate">{c.contraente_nome}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{formatImporto(c.importo)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><Scadenza c={c} /></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${COLORE_STATO_CONTRATTO[c.stato]}`}>
                        {LABEL_STATO_CONTRATTO[c.stato]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalePagine > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">Pagina {pagina + 1} di {totalePagine} — {totale} risultati</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.min(totalePagine - 1, p + 1))} disabled={pagina >= totalePagine - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
