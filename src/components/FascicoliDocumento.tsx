// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Link2Off, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatoFascicoloBadge } from '@/components/StatoFascicoloBadge';
import { useAuth } from '@/hooks/useAuth';
import {
  collegaDocumento, getElencoFascicoli, getFascicoliDelDocumento, messaggioErroreFascicolo, scollegaDocumento,
} from '@/hooks/useFascicoli';
import type { RiferimentoDocumento } from '@/hooks/useFascicoli';
import type { DocumentoFascicolo, Fascicolo } from '@/types';

const NESSUNO = '__nessuno__';

interface FascicoliDocumentoProps {
  documento: RiferimentoDocumento;
  /** Chiamata dopo un collegamento o scollegamento (es. per ricaricare lo storico) */
  onCambio?: () => void;
}

/** Riquadro "Fascicoli" nel dettaglio di un protocollo o di un contratto */
export function FascicoliDocumento({ documento, onCambio }: FascicoliDocumentoProps) {
  const { isOperatore } = useAuth();
  const [collegamenti, setCollegamenti] = useState<DocumentoFascicolo[]>([]);
  const [aperti, setAperti] = useState<Pick<Fascicolo, 'id' | 'numero_completo' | 'oggetto' | 'stato'>[]>([]);
  const [scelto, setScelto] = useState(NESSUNO);
  const [daTogliere, setDaTogliere] = useState<DocumentoFascicolo | null>(null);
  const [lavorando, setLavorando] = useState(false);
  // documento è un oggetto nuovo a ogni render: le dipendenze sono tipo e id
  const tipo = 'protocollo_id' in documento ? 'protocollo' : 'contratto';
  const chiave = 'protocollo_id' in documento ? documento.protocollo_id : documento.contratto_id;

  const carica = useCallback(async () => {
    setCollegamenti(await getFascicoliDelDocumento(
      tipo === 'protocollo' ? { protocollo_id: chiave } : { contratto_id: chiave },
    ));
  }, [tipo, chiave]);

  useEffect(() => {
    carica().catch((err: unknown) => {
      console.error(err);
      toast.error('Errore nel caricamento dei fascicoli del documento');
    });
    if (isOperatore) {
      getElencoFascicoli(true).then(setAperti).catch((err: unknown) => console.error(err));
    }
  }, [carica, isOperatore]);

  const giaCollegati = new Set(collegamenti.map((c) => c.fascicolo_id));
  const disponibili = aperti.filter((f) => !giaCollegati.has(f.id));

  const aggiungi = async () => {
    if (scelto === NESSUNO) return;
    setLavorando(true);
    try {
      await collegaDocumento(scelto, documento);
      setScelto(NESSUNO);
      await carica();
      onCambio?.();
      toast.success('Documento inserito nel fascicolo');
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante l\'inserimento nel fascicolo'));
    } finally {
      setLavorando(false);
    }
  };

  const togli = async () => {
    if (!daTogliere) return;
    setLavorando(true);
    try {
      await scollegaDocumento(daTogliere.id);
      await carica();
      onCambio?.();
      toast.success('Documento tolto dal fascicolo');
    } catch (err: unknown) {
      console.error(err);
      toast.error(messaggioErroreFascicolo(err, 'Errore durante la rimozione dal fascicolo'));
    } finally {
      setDaTogliere(null);
      setLavorando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="h-4 w-4" />
          Fascicoli
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {collegamenti.length === 0 ? (
          <p className="text-sm text-gray-400">Non inserito in nessun fascicolo</p>
        ) : (
          <ul className="space-y-2">
            {collegamenti.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/fascicoli/${c.fascicolo_id}`} className="font-mono text-sm font-semibold text-[#003399] hover:underline">
                      {c.fascicolo?.numero_completo}
                    </Link>
                    {c.fascicolo && <StatoFascicoloBadge stato={c.fascicolo.stato} />}
                  </div>
                  <p className="text-xs text-gray-600">{c.fascicolo?.oggetto}</p>
                </div>
                {isOperatore && c.fascicolo?.stato === 'aperto' && (
                  <Button variant="ghost" size="sm" title="Togli dal fascicolo" aria-label="Togli dal fascicolo"
                    onClick={() => setDaTogliere(c)} disabled={lavorando}>
                    <Link2Off className="h-4 w-4 text-gray-500" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isOperatore && (
          disponibili.length === 0 ? (
            <p className="text-xs text-gray-500">
              Nessun altro fascicolo aperto. <Link to="/fascicoli" className="text-[#003399] underline">Crea un fascicolo</Link>
            </p>
          ) : (
            <div className="flex gap-2">
              <Select value={scelto} onValueChange={setScelto}>
                <SelectTrigger className="h-9 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Scegli un fascicolo aperto…</SelectItem>
                  {disponibili.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.numero_completo} — {f.oggetto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={aggiungi} disabled={lavorando || scelto === NESSUNO} aria-label="Inserisci nel fascicolo">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )
        )}
      </CardContent>

      <AlertDialog open={!!daTogliere} onOpenChange={(v) => { if (!v) setDaTogliere(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere il documento dal fascicolo?</AlertDialogTitle>
            <AlertDialogDescription>
              Il documento resta invariato: viene solo tolto dal fascicolo {daTogliere?.fascicolo?.numero_completo}.
              L'operazione resta nello storico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void togli(); }}>Togli dal fascicolo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
