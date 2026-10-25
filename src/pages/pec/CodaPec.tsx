// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Clock, Download, Eye, FileText, Inbox, Paperclip, Stamp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import {
  aggiornaMessaggioPec, annoPec, comeFileArchiviato, contaCodaPec, contatoriPec, getCodaPec, LABEL_STATO_PEC,
  PecInRitardo, protocollaPec, spiegaSegnalazione, togliDallaCoda, ultimeDatePec,
} from '@/hooks/usePec';
import { getElencoFascicoli } from '@/hooks/useFascicoli';
import { downloadAllegato, visualizzaAllegato } from '@/hooks/useProtocolli';
import { formatNumeroCompleto } from '@/lib/numerazione';
import { formatBytes, formatData } from '@/lib/utils';
import type { Fascicolo, MessaggioPec, StatoPec, TipoFlusso } from '@/types';

const SCHEDE: StatoPec[] = ['da_verificare', 'pronto', 'anomalia', 'scartato'];
const NESSUNO = '__nessuno__';

/** Data e ora della PEC in ora italiana */
const dataPec = (iso: string | null) => (iso ? formatData(iso, true) : '—');

function Direzione({ direzione }: { direzione: TipoFlusso | null }) {
  if (!direzione) return <span className="text-xs font-medium text-amber-700">Da indicare</span>;
  return direzione === 'arrivo'
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><ArrowDownCircle className="h-3.5 w-3.5" />Entrata</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700"><ArrowUpCircle className="h-3.5 w-3.5" />Uscita</span>;
}

export default function CodaPec() {
  const { isOperatore, isAdmin } = useAuth();
  const [scheda, setScheda] = useState<StatoPec>('da_verificare');
  const [conteggi, setConteggi] = useState<Record<StatoPec, number> | null>(null);
  const [messaggi, setMessaggi] = useState<MessaggioPec[]>([]);
  const [ultime, setUltime] = useState<Map<string, string>>(new Map());
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lavorando, setLavorando] = useState(false);
  const [aperto, setAperto] = useState<MessaggioPec | null>(null);
  const [protocolla, setProtocolla] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [elenco, numeri] = await Promise.all([getCodaPec(scheda), contaCodaPec()]);
      setMessaggi(elenco);
      setConteggi(numeri);
      setUltime(await ultimeDatePec(elenco
        .filter((m) => m.data_pec && m.direzione)
        .map((m) => ({ anno: annoPec(m.data_pec as string), tipo: m.direzione as TipoFlusso }))));
      setSelezionati(new Set());
    } catch (err: unknown) {
      console.error(err);
      toast.error('Errore nel caricamento della coda PEC');
    } finally {
      setLoading(false);
    }
  }, [scheda]);

  useEffect(() => { void carica(); }, [carica]);

  /** PEC più vecchia dell'ultima già protocollata nella stessa serie */
  const inRitardo = useCallback((m: MessaggioPec) => {
    if (!m.data_pec || !m.direzione) return false;
    const ultima = ultime.get(`${annoPec(m.data_pec)}-${m.direzione}`);
    return !!ultima && new Date(ultima) > new Date(m.data_pec);
  }, [ultime]);

  const selezionabili = messaggi.filter((m) => scheda === 'pronto' || (scheda === 'da_verificare' && m.direzione));
  const tuttiSelezionati = selezionabili.length > 0 && selezionabili.every((m) => selezionati.has(m.id));
  const alterna = (id: string) => setSelezionati((prev) => {
    const nuovo = new Set(prev);
    if (nuovo.has(id)) nuovo.delete(id); else nuovo.add(id);
    return nuovo;
  });

  const segnaPronte = async () => {
    setLavorando(true);
    let errori = 0;
    for (const id of selezionati) {
      try {
        await aggiornaMessaggioPec(id, { stato: 'pronto' });
      } catch (err: unknown) {
        console.error(err);
        errori++;
      }
    }
    setLavorando(false);
    if (errori) toast.warning(`${selezionati.size - errori} PEC segnate come pronte; ${errori} non aggiornate (controllare direzione e data)`);
    else toast.success(`${selezionati.size} PEC pronte per la protocollazione`);
    await carica();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Inbox className="h-6 w-6 text-[#003399]" />
            PEC da protocollare
          </h1>
          <p className="text-sm text-gray-500">
            In ordine di data della PEC. La data di protocollo sarà quella della PEC (certificata se disponibile).
          </p>
        </div>
        {isOperatore && (
          <Button variant="outline" asChild>
            <Link to="/pec/importazioni">Importa da Google Drive</Link>
          </Button>
        )}
      </div>

      <div role="tablist" className="inline-flex flex-wrap rounded-lg border bg-white p-1 shadow-sm">
        {SCHEDE.map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={scheda === s}
            onClick={() => setScheda(s)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${scheda === s ? 'bg-[#003399] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {LABEL_STATO_PEC[s]}
            {conteggi && <span className="ml-1.5 opacity-80">({conteggi[s]})</span>}
          </button>
        ))}
      </div>

      {isOperatore && selezionati.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm">
          <span>{selezionati.size} PEC selezionate</span>
          {scheda === 'da_verificare' && (
            <Button size="sm" onClick={segnaPronte} disabled={lavorando}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Segna come pronte
            </Button>
          )}
          {scheda === 'pronto' && (
            <Button size="sm" onClick={() => setProtocolla(true)} disabled={lavorando} className="bg-[#003399] hover:bg-[#002277]">
              <Stamp className="mr-2 h-4 w-4" />
              Protocolla selezionate
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
          </div>
        ) : messaggi.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">Nessuna PEC in questa sezione</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                {isOperatore && (scheda === 'pronto' || scheda === 'da_verificare') && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Seleziona tutte"
                      className="h-4 w-4 accent-[#003399]"
                      checked={tuttiSelezionati}
                      onChange={() => setSelezionati(tuttiSelezionati ? new Set() : new Set(selezionabili.map((m) => m.id)))}
                    />
                  </th>
                )}
                <th className="px-3 py-3 text-left">Data PEC</th>
                <th className="px-3 py-3 text-left">Tipo</th>
                <th className="px-3 py-3 text-left">Mittente / destinatari</th>
                <th className="px-3 py-3 text-left">Oggetto</th>
                <th className="px-3 py-3 text-right">File</th>
                <th className="px-3 py-3 text-left">Segnalazioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {messaggi.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-blue-50/50" onClick={() => setAperto(m)}>
                  {isOperatore && (scheda === 'pronto' || scheda === 'da_verificare') && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Seleziona ${m.id_acquisizione}`}
                        className="h-4 w-4 accent-[#003399]"
                        checked={selezionati.has(m.id)}
                        disabled={!selezionabili.includes(m)}
                        onChange={() => alterna(m.id)}
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <p className="text-gray-900">{dataPec(m.data_pec)}</p>
                    <p className={`text-xs ${m.data_certificata ? 'text-green-700' : 'text-amber-700'}`}>
                      {m.data_certificata ? 'certificata' : 'non certificata'}
                    </p>
                  </td>
                  <td className="px-3 py-2.5"><Direzione direzione={m.direzione} /></td>
                  <td className="max-w-[16rem] px-3 py-2.5">
                    <p className="truncate text-gray-800" title={m.mittente ?? ''}>{m.mittente ?? '—'}</p>
                    <p className="truncate text-xs text-gray-500" title={m.destinatari ?? ''}>→ {m.destinatari ?? '—'}</p>
                  </td>
                  <td className="max-w-[22rem] px-3 py-2.5"><p className="line-clamp-2 text-gray-800">{m.oggetto ?? '(senza oggetto)'}</p></td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{m.protocollo_pec_file?.length ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {m.anomalie.length > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{m.anomalie.length} anomalie</span>
                      )}
                      {m.avvisi.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{m.avvisi.length} avvisi</span>
                      )}
                      {inRitardo(m) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
                          title="Più vecchia dell'ultima PEC già protocollata: riceverà comunque il numero successivo">
                          <Clock className="h-3 w-3" />in ritardo
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {aperto && (
        <DialogoMessaggio
          messaggio={aperto}
          inRitardo={inRitardo(aperto)}
          modificabile={isOperatore}
          eliminabile={isAdmin}
          onChiudi={() => setAperto(null)}
          onCambiato={() => { setAperto(null); void carica(); }}
        />
      )}

      {protocolla && (
        <DialogoProtocolla
          messaggi={messaggi.filter((m) => selezionati.has(m.id))}
          inRitardo={inRitardo}
          onChiudi={() => setProtocolla(false)}
          onFatto={() => { setProtocolla(false); void carica(); }}
        />
      )}
    </div>
  );
}

// ── Scheda di una PEC: dati, file, segnalazioni e correzioni ──────────────────

function DialogoMessaggio({ messaggio: m, inRitardo, modificabile, eliminabile, onChiudi, onCambiato }: {
  messaggio: MessaggioPec;
  inRitardo: boolean;
  modificabile: boolean;
  eliminabile: boolean;
  onChiudi: () => void;
  onCambiato: () => void;
}) {
  const [direzione, setDirezione] = useState<TipoFlusso | null>(m.direzione);
  const [oggetto, setOggetto] = useState(m.oggetto ?? '');
  const [note, setNote] = useState(m.note_verifica ?? '');
  const [lavorando, setLavorando] = useState(false);
  const [confermaTogli, setConfermaTogli] = useState(false);
  const file = [...(m.protocollo_pec_file ?? [])].sort((a, b) =>
    ({ pdf: 0, allegato: 1, eml: 2 }[a.ruolo] - { pdf: 0, allegato: 1, eml: 2 }[b.ruolo]) || a.posizione - b.posizione);

  const salva = async (stato?: StatoPec) => {
    if (oggetto.trim().length === 0) {
      toast.error('L\'oggetto non può essere vuoto');
      return;
    }
    setLavorando(true);
    try {
      await aggiornaMessaggioPec(m.id, {
        direzione,
        oggetto: oggetto.trim(),
        note_verifica: note.trim() || null,
        ...(stato ? { stato } : {}),
      });
      toast.success(stato === 'pronto' ? 'PEC pronta per la protocollazione' : stato === 'scartato' ? 'PEC scartata: non verrà protocollata' : 'Modifiche salvate');
      onCambiato();
    } catch (err: unknown) {
      console.error(err);
      const messaggio = (err as { message?: string }).message ?? '';
      toast.error(/anomalie|entrata o in uscita|data/i.test(messaggio) ? messaggio : 'Salvataggio non riuscito');
    } finally {
      setLavorando(false);
    }
  };

  const togli = async () => {
    setLavorando(true);
    try {
      await togliDallaCoda(m.id);
      toast.success('PEC tolta dalla coda: verrà reimportata alla prossima importazione');
      onCambiato();
    } catch (err: unknown) {
      console.error(err);
      toast.error('Operazione non riuscita');
      setLavorando(false);
    }
  };

  const apri = async (f: NonNullable<MessaggioPec['protocollo_pec_file']>[number], scarica: boolean) => {
    try {
      if (scarica) await downloadAllegato(comeFileArchiviato(f));
      else await visualizzaAllegato(comeFileArchiviato(f));
    } catch {
      toast.error('File non disponibile');
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{m.oggetto ?? '(senza oggetto)'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div><dt className="text-xs text-gray-500">Data della PEC (sarà la data di protocollo)</dt>
              <dd className="font-medium">{dataPec(m.data_pec)} {m.data_certificata ? '— certificata' : '— dall\'email, non certificata'}</dd></div>
            <div><dt className="text-xs text-gray-500">ID acquisizione</dt><dd className="font-mono text-xs">{m.id_acquisizione}</dd></div>
            <div><dt className="text-xs text-gray-500">Mittente</dt><dd className="break-all">{m.mittente ?? '—'}</dd></div>
            <div><dt className="text-xs text-gray-500">Destinatari</dt><dd className="break-all">{m.destinatari ?? '—'}</dd></div>
            {m.cc && <div><dt className="text-xs text-gray-500">Cc</dt><dd className="break-all">{m.cc}</dd></div>}
            <div><dt className="text-xs text-gray-500">Importata il</dt><dd>{formatData(m.importato_il, true)}</dd></div>
          </dl>

          {(m.anomalie.length > 0 || m.avvisi.length > 0 || inRitardo) && (
            <ul className="space-y-1">
              {m.anomalie.map((a) => (
                <li key={a} className="flex gap-2 rounded-md bg-red-50 px-3 py-1.5 text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />{spiegaSegnalazione(a)}
                </li>
              ))}
              {m.avvisi.map((a) => (
                <li key={a} className="flex gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />{spiegaSegnalazione(a)}
                </li>
              ))}
              {inRitardo && (
                <li className="flex gap-2 rounded-md bg-purple-50 px-3 py-1.5 text-purple-900">
                  <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  PEC più vecchia dell'ultima già protocollata nella stessa serie: riceverà comunque il numero successivo.
                </li>
              )}
            </ul>
          )}

          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500"><Paperclip className="h-3.5 w-3.5" />File</p>
            <ul className="divide-y rounded-md border">
              {file.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-1.5">
                  <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate" title={f.nome_file}>
                    {f.ruolo === 'pdf' ? 'PDF della PEC' : f.ruolo === 'eml' ? 'EML originale' : `${f.posizione}. ${f.nome_file}`}
                    {f.generato && <span className="ml-2 text-xs text-amber-700">(scheda creata dal protocollo)</span>}
                  </span>
                  <span className="text-xs text-gray-400">{formatBytes(f.dimensione_bytes ?? undefined)}</span>
                  <Button variant="ghost" size="sm" title="Vedi" onClick={() => apri(f, false)}><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" title="Scarica" onClick={() => apri(f, true)}><Download className="h-4 w-4" /></Button>
                </li>
              ))}
              {file.length === 0 && <li className="px-3 py-2 text-gray-400">Nessun file</li>}
            </ul>
          </div>

          {m.corpo_anteprima && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Testo (anteprima dall'indice)</p>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-gray-50 p-3 text-xs text-gray-700">{m.corpo_anteprima}</p>
            </div>
          )}

          {modificabile && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <div className="space-y-1.5">
                  <Label>Entrata o uscita</Label>
                  <Select value={direzione ?? NESSUNO} onValueChange={(v) => setDirezione(v === NESSUNO ? null : (v as TipoFlusso))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NESSUNO}>Da indicare</SelectItem>
                      <SelectItem value="arrivo">Entrata (P-A)</SelectItem>
                      <SelectItem value="partenza">Uscita (P-U)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pec-oggetto">Oggetto (correggibile)</Label>
                  <Input id="pec-oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pec-note">Note di verifica</Label>
                <Textarea id="pec-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {eliminabile && (
            confermaTogli ? (
              <Button variant="outline" className="border-red-300 text-red-600" onClick={togli} disabled={lavorando}>
                Conferma: togli dalla coda
              </Button>
            ) : (
              <Button variant="ghost" className="text-red-600" onClick={() => setConfermaTogli(true)} disabled={lavorando}
                title="La PEC verrà reimportata da Drive alla prossima importazione">
                Togli dalla coda
              </Button>
            )
          )}
          <span className="flex-1" />
          {modificabile && (
            <>
              {m.stato !== 'scartato' && (
                <Button variant="outline" onClick={() => salva('scartato')} disabled={lavorando}>Scarta (non protocollare)</Button>
              )}
              {(m.stato === 'scartato' || m.stato === 'pronto') && (
                <Button variant="outline" onClick={() => salva('da_verificare')} disabled={lavorando}>Riporta da verificare</Button>
              )}
              <Button variant="outline" onClick={() => salva()} disabled={lavorando}>Salva</Button>
              {m.stato !== 'pronto' && m.anomalie.length === 0 && (
                <Button onClick={() => salva('pronto')} disabled={lavorando || !direzione} className="bg-[#003399] hover:bg-[#002277]">
                  Segna come pronta
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Protocollazione delle PEC selezionate ─────────────────────────────────────

function DialogoProtocolla({ messaggi, inRitardo, onChiudi, onFatto }: {
  messaggi: MessaggioPec[];
  inRitardo: (m: MessaggioPec) => boolean;
  onChiudi: () => void;
  onFatto: () => void;
}) {
  const [contatori, setContatori] = useState<Map<string, number> | null>(null);
  const [fascicoli, setFascicoli] = useState<Pick<Fascicolo, 'id' | 'numero_completo' | 'oggetto' | 'stato'>[]>([]);
  const [fascicolo, setFascicolo] = useState(NESSUNO);
  const [confermaRitardo, setConfermaRitardo] = useState(false);
  const [lavorando, setLavorando] = useState(false);

  useEffect(() => {
    contatoriPec().then(setContatori).catch((err: unknown) => console.error(err));
    getElencoFascicoli(true).then(setFascicoli).catch((err: unknown) => console.error(err));
  }, []);

  // Stesso ordine della funzione del database: data della PEC, poi id
  const ordinati = useMemo(() => [...messaggi].sort((a, b) =>
    (a.data_pec ?? '').localeCompare(b.data_pec ?? '') || a.id.localeCompare(b.id)), [messaggi]);
  const anteprima = useMemo(() => {
    if (!contatori) return new Map<string, string>();
    const prossimo = new Map(contatori);
    const out = new Map<string, string>();
    for (const m of ordinati) {
      if (!m.data_pec || !m.direzione) continue;
      const anno = annoPec(m.data_pec);
      const chiave = `${anno}-${m.direzione}`;
      const n = (prossimo.get(chiave) ?? 0) + 1;
      prossimo.set(chiave, n);
      out.set(m.id, formatNumeroCompleto(anno, n, m.direzione, 'pec'));
    }
    return out;
  }, [contatori, ordinati]);
  const ritardi = ordinati.filter(inRitardo).length;

  const conferma = async () => {
    setLavorando(true);
    try {
      const esito = await protocollaPec(ordinati.map((m) => m.id), fascicolo === NESSUNO ? null : fascicolo, confermaRitardo);
      toast.success(esito.length === 1
        ? `PEC protocollata: ${esito[0].numero_completo}`
        : `${esito.length} PEC protocollate: da ${esito[0].numero_completo} a ${esito[esito.length - 1].numero_completo}`);
      onFatto();
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof PecInRitardo) {
        toast.error('Una PEC è più vecchia dell\'ultima già protocollata: confermare con la casella apposita.');
      } else {
        toast.error('Protocollazione non riuscita: nessun numero è stato assegnato. Aggiornare la pagina e riprovare.');
      }
      setLavorando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !lavorando) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Protocollare {ordinati.length} PEC?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-gray-600">
            Ogni PEC riceve il numero della serie PEC con data di protocollo uguale alla data della PEC.
            I protocolli PEC restano bloccati: il numero non potrà essere cambiato né riutilizzato.
          </p>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
            {ordinati.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-32 font-mono text-xs font-semibold text-[#003399]">{anteprima.get(m.id) ?? '…'}</span>
                <span className="w-32 whitespace-nowrap text-xs text-gray-500">{dataPec(m.data_pec)}</span>
                <span className="min-w-0 flex-1 truncate">{m.oggetto ?? '(senza oggetto)'}</span>
                {inRitardo(m) && <Clock className="h-4 w-4 text-purple-700" aria-label="in ritardo" />}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">Numeri previsti: quelli definitivi li assegna il database al momento della conferma.</p>

          <div className="space-y-1.5">
            <Label>Inserisci nel fascicolo (facoltativo)</Label>
            <Select value={fascicolo} onValueChange={setFascicolo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>Nessun fascicolo</SelectItem>
                {fascicoli.map((f) => <SelectItem key={f.id} value={f.id}>{f.numero_completo} — {f.oggetto}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {ritardi > 0 && (
            <label className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-purple-900">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={confermaRitardo} onChange={(e) => setConfermaRitardo(e.target.checked)} />
              <span>
                {ritardi === 1 ? 'Una PEC è più vecchia' : `${ritardi} PEC sono più vecchie`} dell'ultima già protocollata nella
                stessa serie: riceveranno comunque i numeri successivi, con la loro data. Confermo.
              </span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={lavorando}>Annulla</Button>
          <Button onClick={conferma} disabled={lavorando || (ritardi > 0 && !confermaRitardo)} className="bg-[#003399] hover:bg-[#002277]">
            {lavorando ? 'Protocollazione…' : 'Protocolla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
