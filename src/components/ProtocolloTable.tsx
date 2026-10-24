// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Mail,
  Send,
  FileText,
  Monitor,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatoBadge } from '@/components/StatoBadge';
import { formatData } from '@/lib/utils';
import type { Protocollo, TipoFlusso, Canale } from '@/types';

const IconaCanale: Record<Canale, React.ReactNode> = {
  pec: <span title="PEC" className="flex items-center gap-1 text-purple-600"><Send className="h-3.5 w-3.5" />PEC</span>,
  email: <span title="Email" className="flex items-center gap-1 text-blue-600"><Mail className="h-3.5 w-3.5" />Email</span>,
  cartaceo: <span title="Cartaceo" className="flex items-center gap-1 text-gray-600"><FileText className="h-3.5 w-3.5" />Cartaceo</span>,
  digitale: <span title="Digitale" className="flex items-center gap-1 text-teal-600"><Monitor className="h-3.5 w-3.5" />Digitale</span>,
};

const IconaFlusso: Record<TipoFlusso, React.ReactNode> = {
  arrivo: <span title="Arrivo" className="flex items-center gap-1 text-green-700 font-semibold"><ArrowDownCircle className="h-4 w-4" />Arrivo</span>,
  partenza: <span title="Partenza" className="flex items-center gap-1 text-orange-700 font-semibold"><ArrowUpCircle className="h-4 w-4" />Partenza</span>,
};

type Ordinamento = { colonna: string; ascendente: boolean };

interface ProtocolloTableProps {
  protocolli: Protocollo[];
  ordinamento: Ordinamento;
  onOrdinamento: (colonna: string) => void;
  loading: boolean;
}

function ThOrdinabile({ colonna, label, ordinamento, onOrdinamento }: {
  colonna: string;
  label: string;
  ordinamento: Ordinamento;
  onOrdinamento: (c: string) => void;
}) {
  const attivo = ordinamento.colonna === colonna;
  return (
    <th
      className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-100 select-none"
      onClick={() => onOrdinamento(colonna)}
    >
      <div className="flex items-center gap-1">
        {label}
        {attivo ? (
          ordinamento.ascendente ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </div>
    </th>
  );
}

export function ProtocolloTable({
  protocolli,
  ordinamento,
  onOrdinamento,
  loading,
}: ProtocolloTableProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
        <span className="ml-3 text-sm">Caricamento...</span>
      </div>
    );
  }

  if (protocolli.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <FileText className="mb-3 h-12 w-12 opacity-30" />
        <p className="text-sm">Nessun protocollo trovato</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          <tr>
            <ThOrdinabile colonna="numero" label="Numero" ordinamento={ordinamento} onOrdinamento={onOrdinamento} />
            <ThOrdinabile colonna="data_registrazione" label="Data" ordinamento={ordinamento} onOrdinamento={onOrdinamento} />
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Tipo</th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Canale</th>
            <ThOrdinabile colonna="oggetto" label="Oggetto" ordinamento={ordinamento} onOrdinamento={onOrdinamento} />
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Mittente / Dest.</th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Ufficio</th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Stato</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Azioni</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {protocolli.map((p) => (
            <tr
              key={p.id}
              className="cursor-pointer hover:bg-blue-50 transition-colors"
              onClick={() => navigate(`/protocollo/${p.id}`)}
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-[#003399]">
                <span className="inline-flex items-center gap-1.5">
                  {p.numero_completo}
                  {p.bloccato && (
                    <Lock className="h-3.5 w-3.5 text-gray-500" aria-label="Protocollo bloccato" />
                  )}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                {formatData(p.data_registrazione)}
              </td>
              <td className="px-4 py-3">
                {IconaFlusso[p.tipo_flusso]}
              </td>
              <td className="px-4 py-3">
                {IconaCanale[p.canale]}
              </td>
              <td className="px-4 py-3 max-w-xs">
                <span className="line-clamp-2">{p.oggetto}</span>
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-[180px]">
                <span className="truncate block">
                  {p.tipo_flusso === 'arrivo' ? p.mittente_nome : p.destinatario_nome}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 text-xs">
                {p.ufficio_assegnatario ?? '—'}
              </td>
              <td className="px-4 py-3">
                <StatoBadge stato={p.stato} />
              </td>
              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/protocollo/${p.id}`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
