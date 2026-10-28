// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState, useCallback } from 'react';
import { useProtocolli } from '@/hooks/useProtocolli';
import { ProtocolloTable } from '@/components/ProtocolloTable';
import { SearchBar } from '@/components/SearchBar';
import { ExportButton } from '@/components/ExportButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Filter, X, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { UFFICI } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { getElencoFascicoli } from '@/hooks/useFascicoli';
import type { Fascicolo, FiltriProtocollo, Registro, TipoFlusso } from '@/types';

const annoCorrente = new Date().getFullYear();
const ANNI = Array.from({ length: 5 }, (_, i) => annoCorrente - i);

// Radix Select non accetta value="" su una voce (lancia un errore che blocca la pagina):
// per l'opzione "Tutti" si usa un valore sentinella, convertito in "nessun filtro"
const TUTTI = '__tutti__';

// Ultima scelta Arrivo/Partenza, ricordata per utente in questo browser.
// localStorage può non essere disponibile (navigazione privata, dati bloccati): si ignora.
const chiaveTipo = (utenteId?: string) => `protogal-registro-tipo:${utenteId ?? 'anonimo'}`;

function leggiTipoSalvato(utenteId?: string): TipoFlusso | undefined {
  try {
    const v = localStorage.getItem(chiaveTipo(utenteId));
    return v === 'arrivo' || v === 'partenza' ? v : undefined;
  } catch {
    return undefined;
  }
}

function salvaTipo(utenteId: string | undefined, tipo: TipoFlusso | undefined) {
  try {
    if (tipo) localStorage.setItem(chiaveTipo(utenteId), tipo);
    else localStorage.removeItem(chiaveTipo(utenteId));
  } catch {
    // preferenza non salvata: nessun effetto sul funzionamento
  }
}

interface ListaProtocolliProps {
  /** Serie mostrata: registro ordinario (predefinito) o PEC */
  registro?: Registro;
  /** Per le pagine "PEC in entrata" / "PEC in uscita": tipo fisso, senza pulsanti rapidi */
  tipoFisso?: TipoFlusso;
}

export default function ListaProtocolli({ registro = 'ordinario', tipoFisso }: ListaProtocolliProps) {
  const { protocolli, totale, loading, carica, pageSize } = useProtocolli();
  const { user } = useAuth();
  const [pagina, setPagina] = useState(0);
  const [ordinamento, setOrdinamento] = useState({ colonna: 'data_registrazione', ascendente: false });
  // Le PEC prendono l'anno della data della PEC: importando posta arretrata finirebbero
  // fuori dal filtro sull'anno corrente, quindi per la serie PEC si parte da tutti gli anni
  const annoPredefinito = registro === 'pec' ? undefined : annoCorrente;
  const filtriIniziali = (): FiltriProtocollo => ({
    registro,
    anno: annoPredefinito,
    tipo_flusso: tipoFisso ?? leggiTipoSalvato(user?.id),
  });
  const [filtri, setFiltri] = useState<FiltriProtocollo>(filtriIniziali);

  // La stessa pagina serve PEC in entrata e in uscita: cambiando voce di menu si riparte
  useEffect(() => {
    setFiltri(filtriIniziali());
    setPagina(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registro, tipoFisso]);

  // Memorizza ogni cambio di Arrivo/Partenza/Tutti (pulsanti, pannello Filtri o Reset)
  useEffect(() => {
    if (!tipoFisso) salvaTipo(user?.id, filtri.tipo_flusso || undefined);
  }, [user?.id, filtri.tipo_flusso, tipoFisso]);
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const [fascicoli, setFascicoli] = useState<Pick<Fascicolo, 'id' | 'numero_completo' | 'oggetto' | 'stato'>[]>([]);

  useEffect(() => {
    getElencoFascicoli().then(setFascicoli).catch((err: unknown) => console.error(err));
  }, []);

  const aggiorna = useCallback(() => {
    carica(filtri, pagina, ordinamento);
  }, [carica, filtri, pagina, ordinamento]);

  useEffect(() => {
    aggiorna();
  }, [aggiorna]);

  const handleOrdinamento = (colonna: string) => {
    setOrdinamento((prev) => ({
      colonna,
      ascendente: prev.colonna === colonna ? !prev.ascendente : false,
    }));
    setPagina(0);
  };

  const handleFiltro = (chiave: keyof FiltriProtocollo, valore: string | number) => {
    setFiltri((prev) => ({ ...prev, [chiave]: valore === TUTTI ? undefined : valore || undefined }));
    setPagina(0);
  };

  const resettaFiltri = () => {
    setFiltri({ registro, anno: annoPredefinito, tipo_flusso: tipoFisso });
    setPagina(0);
  };

  const totalePagine = Math.ceil(totale / pageSize);
  // Filtri diversi da quelli predefiniti, per badge e pulsante Reset
  const filtriAttivi = (Object.keys(filtri) as (keyof FiltriProtocollo)[])
    .filter((k) => k !== 'registro' && !(k === 'tipo_flusso' && tipoFisso))
    .filter((k) => (k === 'anno' ? filtri.anno !== annoPredefinito : Boolean(filtri[k])))
    .length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {registro === 'pec' ? (tipoFisso === 'partenza' ? 'PEC in uscita' : 'PEC in entrata') : 'Registro Protocolli'}
          </h1>
          <p className="text-sm text-gray-500">
            {totale} documenti trovati{registro === 'pec' ? ' — serie P-A / P-U, data di protocollo = data della PEC' : ''}
          </p>
        </div>
        <ExportButton anno={filtri.anno} registro={registro} />
      </div>

      {/* Selezione rapida Arrivo / Partenza (stesso filtro "Tipo" del pannello Filtri) */}
      {!tipoFisso && (
      <div role="group" aria-label="Tipo di protocollo" className="inline-flex rounded-lg border bg-white p-1 shadow-sm">
        {([
          { valore: undefined, etichetta: 'Tutti', icona: null, attivo: 'bg-[#003399] text-white' },
          { valore: 'arrivo', etichetta: 'Arrivo', icona: ArrowDownCircle, attivo: 'bg-green-600 text-white' },
          { valore: 'partenza', etichetta: 'Partenza', icona: ArrowUpCircle, attivo: 'bg-orange-500 text-white' },
        ] as const).map(({ valore, etichetta, icona: Icona, attivo }) => {
          const selezionato = (filtri.tipo_flusso || undefined) === valore;
          return (
            <button
              key={etichetta}
              type="button"
              aria-pressed={selezionato}
              onClick={() => handleFiltro('tipo_flusso', valore ?? TUTTI)}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                selezionato ? attivo : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {Icona && <Icona className="h-4 w-4" />}
              {etichetta}
            </button>
          );
        })}
      </div>
      )}

      {/* Barra ricerca + filtri */}
      <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <SearchBar
              value={filtri.testo ?? ''}
              onChange={(v) => handleFiltro('testo', v)}
              placeholder="Cerca per numero, oggetto, mittente..."
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMostraFiltri(!mostraFiltri)}
            className="relative"
          >
            <Filter className="mr-2 h-4 w-4" />
            Filtri
            {filtriAttivi > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#003399] text-xs text-white">
                {filtriAttivi}
              </span>
            )}
          </Button>
          {filtriAttivi > 0 && (
            <Button variant="ghost" size="sm" onClick={resettaFiltri}>
              <X className="mr-1 h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        {mostraFiltri && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Anno</label>
              <Select
                value={filtri.anno?.toString() ?? TUTTI}
                onValueChange={(v) => handleFiltro('anno', v === TUTTI ? TUTTI : parseInt(v, 10))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti gli anni</SelectItem>
                  {ANNI.map((a) => (
                    <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!tipoFisso && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Tipo</label>
              <Select
                value={filtri.tipo_flusso || TUTTI}
                onValueChange={(v) => handleFiltro('tipo_flusso', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti</SelectItem>
                  <SelectItem value="arrivo">Arrivo</SelectItem>
                  <SelectItem value="partenza">Partenza</SelectItem>
                </SelectContent>
              </Select>
            </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Canale</label>
              <Select
                value={filtri.canale || TUTTI}
                onValueChange={(v) => handleFiltro('canale', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti</SelectItem>
                  <SelectItem value="pec">PEC</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="cartaceo">Cartaceo</SelectItem>
                  <SelectItem value="digitale">Digitale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Stato</label>
              <Select
                value={filtri.stato || TUTTI}
                onValueChange={(v) => handleFiltro('stato', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti</SelectItem>
                  <SelectItem value="ricevuto">Ricevuto</SelectItem>
                  <SelectItem value="in_lavorazione">In lavorazione</SelectItem>
                  <SelectItem value="evaso">Evaso</SelectItem>
                  <SelectItem value="archiviato">Archiviato</SelectItem>
                  <SelectItem value="annullato">Annullato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Ufficio</label>
              <Select
                value={filtri.ufficio || TUTTI}
                onValueChange={(v) => handleFiltro('ufficio', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti</SelectItem>
                  {UFFICI.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Fascicolo</label>
              <Select
                value={filtri.fascicolo || TUTTI}
                onValueChange={(v) => handleFiltro('fascicolo', v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti</SelectItem>
                  {fascicoli.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.numero_completo} — {f.oggetto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Tabella */}
      <div className="rounded-lg border bg-white shadow-sm">
        <ProtocolloTable
          protocolli={protocolli}
          ordinamento={ordinamento}
          onOrdinamento={handleOrdinamento}
          loading={loading}
        />

        {/* Paginazione */}
        {totalePagine > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
              Pagina {pagina + 1} di {totalePagine} — {totale} risultati
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalePagine - 1, p + 1))}
                disabled={pagina >= totalePagine - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
