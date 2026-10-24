// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTuttiProtocolli } from '@/hooks/useProtocolli';
import { formatData, LABEL_STATO, LABEL_CANALE, LABEL_FLUSSO } from '@/lib/utils';
import { toast } from 'sonner';
import { NOME_ENTE } from '@/lib/ente';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExportButtonProps {
  anno?: number;
}


export function ExportButton({ anno }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const esportaExcel = async () => {
    setLoading(true);
    try {
      const dati = await getTuttiProtocolli(anno);
      const righe = dati.map((p) => ({
        'Numero': p.numero_completo,
        'Data Registrazione': formatData(p.data_registrazione),
        'Data Documento': formatData(p.data_documento),
        'Tipo': LABEL_FLUSSO[p.tipo_flusso],
        'Canale': LABEL_CANALE[p.canale],
        'Oggetto': p.oggetto,
        'Mittente': p.mittente_nome ?? '',
        'Email Mittente': p.mittente_email ?? '',
        'PEC Mittente': p.mittente_pec ?? '',
        'Destinatario': p.destinatario_nome ?? '',
        'Ufficio': p.ufficio_assegnatario ?? '',
        'Stato': LABEL_STATO[p.stato],
        'Note': p.note ?? '',
      }));

      const ws = XLSX.utils.json_to_sheet(righe);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registro');
      XLSX.writeFile(wb, `registro_protocollo_${anno ?? 'tutti'}.xlsx`);
      toast.success('Export Excel completato');
    } catch (e) {
      toast.error('Errore durante l\'export Excel');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const esportaPDF = async () => {
    setLoading(true);
    try {
      const dati = await getTuttiProtocolli(anno);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(14);
      doc.setTextColor(0, 51, 153);
      doc.text(`${NOME_ENTE} — Registro di Protocollo${anno ? ` ${anno}` : ''}`, 14, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Generato il ${formatData(new Date().toISOString(), true)}`, 14, 21);

      autoTable(doc, {
        startY: 26,
        head: [['Numero', 'Data Reg.', 'Tipo', 'Canale', 'Oggetto', 'Mittente/Dest.', 'Ufficio', 'Stato']],
        body: dati.map((p) => [
          p.numero_completo,
          formatData(p.data_registrazione),
          LABEL_FLUSSO[p.tipo_flusso],
          LABEL_CANALE[p.canale],
          p.oggetto.length > 50 ? p.oggetto.substring(0, 47) + '...' : p.oggetto,
          p.mittente_nome ?? p.destinatario_nome ?? '',
          p.ufficio_assegnatario ?? '',
          LABEL_STATO[p.stato],
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 51, 153], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 22 },
          2: { cellWidth: 18 },
          3: { cellWidth: 20 },
          4: { cellWidth: 70 },
          5: { cellWidth: 45 },
          6: { cellWidth: 35 },
          7: { cellWidth: 25 },
        },
      });

      doc.save(`registro_protocollo_${anno ?? 'tutti'}.pdf`);
      toast.success('Export PDF completato');
    } catch (e) {
      toast.error('Errore durante l\'export PDF');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={esportaExcel}
        disabled={loading}
      >
        <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={esportaPDF}
        disabled={loading}
      >
        <FileText className="mr-2 h-4 w-4 text-red-600" />
        PDF
      </Button>
    </div>
  );
}
