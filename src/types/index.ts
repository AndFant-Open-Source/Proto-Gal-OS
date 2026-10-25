// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
export type Ruolo = 'admin' | 'operatore' | 'lettore';
export type TipoFlusso = 'arrivo' | 'partenza';
export type Canale = 'pec' | 'email' | 'cartaceo' | 'digitale';
export type StatoProtocollo = 'ricevuto' | 'in_lavorazione' | 'evaso' | 'archiviato' | 'annullato';
/** ordinario: A/… U/… · pec: P-A/… P-U/… (dalla coda PEC) */
export type Registro = 'ordinario' | 'pec';

export interface Profilo {
  id: string;
  nome_completo: string;
  ruolo: Ruolo;
  ufficio?: string;
  attivo: boolean;
  created_at: string;
}

// Edizione per singolo GAL: ogni installazione (progetto Supabase + sito) serve un solo ente,
// il cui nome viene da VITE_NOME_ENTE. Non esistono tabelle o campi "GAL".

export interface DatiStampigliatura {
  nome_gal: string;
  numero_protocollo: string;
  /** Contratti: "Rep." al posto di Arrivo/Partenza · PEC: "PEC Arrivo"/"PEC Partenza" */
  registro?: 'protocollo' | 'repertorio' | 'pec';
  tipo_flusso?: 'arrivo' | 'partenza';
  data_stampa: string;
}

export interface SequenzaNumerazione {
  registro?: Registro;
  anno: number;
  tipo_flusso: 'arrivo' | 'partenza';
  ultimo_numero: number;
}

export interface Protocollo {
  id: string;
  registro: Registro;
  numero: number;
  anno: number;
  numero_completo: string;
  data_registrazione: string;
  data_documento?: string;
  tipo_flusso: TipoFlusso;
  canale: Canale;
  oggetto: string;
  mittente_nome?: string;
  mittente_email?: string;
  mittente_pec?: string;
  destinatario_nome?: string;
  destinatario_email?: string;
  destinatario_pec?: string;
  ufficio_assegnatario?: string;
  operatore_id?: string;
  stato: StatoProtocollo;
  note?: string;
  protocollo_collegato?: string;
  /** Bloccato: numero, tipo e data non modificabili né rinumerabili */
  bloccato: boolean;
  bloccato_da?: string | null;
  bloccato_il?: string | null;
  created_at: string;
  updated_at: string;
  protocollo_allegati?: Allegato[];
}

/** Payload di aggiornamento: null svuota esplicitamente un campo (undefined lo lascia invariato) */
export type AggiornamentoProtocollo = {
  [K in keyof Protocollo]?: Protocollo[K] | null;
};

export interface Allegato {
  id: string;
  protocollo_id: string;
  nome_file: string;
  storage_path: string;
  dimensione_bytes?: number;
  tipo_mime?: string;
  caricato_da?: string;
  /** Solo protocolli PEC: impronta, ruolo e ordine originale del file */
  sha256?: string | null;
  origine?: 'pdf_pec' | 'allegato' | 'eml' | null;
  posizione?: number | null;
  created_at: string;
}

// ── Repertorio contratti ──────────────────────────────────────────────────────

export type TipoContratto =
  | 'lavori' | 'servizi' | 'forniture' | 'incarico_professionale' | 'convenzione' | 'altro';
export type FormaStipula =
  | 'scrittura_privata' | 'scrittura_privata_autenticata' | 'atto_pubblico_amministrativo'
  | 'corrispondenza_commerciale' | 'altro';
export type StatoContratto = 'in_corso' | 'concluso' | 'risolto' | 'annullato';

export interface Contratto {
  id: string;
  numero: number;
  anno: number;
  /** C/NNNN/AAAA — colonna generata dal database */
  numero_completo: string;
  data_repertorio: string;
  data_stipula?: string | null;
  tipo_contratto: TipoContratto;
  forma_stipula?: FormaStipula | null;
  oggetto: string;
  contraente_nome: string;
  contraente_codice_fiscale?: string | null;
  contraente_pec?: string | null;
  importo?: number | null;
  cig?: string | null;
  cup?: string | null;
  data_inizio?: string | null;
  data_fine?: string | null;
  stato: StatoContratto;
  protocollo_collegato?: string | null;
  note?: string | null;
  operatore_id?: string | null;
  created_at: string;
  updated_at: string;
  protocollo_contratti_allegati?: AllegatoContratto[];
}

/** Campi compilabili dall'utente (numero, data di repertorio e operatore li gestisce il database) */
export type DatiContratto = Omit<
  Contratto,
  'id' | 'numero' | 'anno' | 'numero_completo' | 'data_repertorio' |
  'operatore_id' | 'created_at' | 'updated_at' | 'protocollo_contratti_allegati'
>;

export interface AllegatoContratto {
  id: string;
  contratto_id: string;
  nome_file: string;
  storage_path: string;
  dimensione_bytes?: number;
  tipo_mime?: string;
  caricato_da?: string;
  created_at: string;
}

export interface FiltriContratto {
  anno?: number;
  tipo_contratto?: TipoContratto;
  stato?: StatoContratto;
  testo?: string;
}

export interface LogAzione {
  id: string;
  protocollo_id?: string;
  contratto_id?: string;
  fascicolo_id?: string;
  utente_id?: string;
  azione: string;
  dettaglio?: Record<string, unknown>;
  numero_completo_rif?: string | null;
  ip_address?: string;
  created_at: string;
  profilo?: Profilo;
}

export interface FiltriProtocollo {
  /** Serie: ordinaria se non indicata */
  registro?: Registro;
  anno?: number;
  tipo_flusso?: TipoFlusso | '';
  canale?: Canale | '';
  stato?: StatoProtocollo | '';
  ufficio?: string;
  testo?: string;
  /** id del fascicolo: solo i protocolli inseriti in quel fascicolo */
  fascicolo?: string;
}

export interface StatisticheDashboard {
  totale_oggi: number;
  totale_mese: number;
  totale_anno: number;
  arrivi_anno: number;
  partenze_anno: number;
  per_mese: { mese: string; arrivi: number; partenze: number }[];
}

// ── Titolario e fascicoli ─────────────────────────────────────────────────────

export interface VoceTitolario {
  id: string;
  codice: string;
  descrizione: string;
  padre_id: string | null;
  attivo: boolean;
  created_at: string;
  updated_at: string;
}

export type StatoFascicolo = 'aperto' | 'chiuso';

export interface Fascicolo {
  id: string;
  numero: number;
  anno: number;
  /** F/NNNN/AAAA — colonna generata dal database */
  numero_completo: string;
  oggetto: string;
  titolario_id: string | null;
  responsabile: string | null;
  ufficio: string | null;
  stato: StatoFascicolo;
  data_apertura: string;
  data_chiusura: string | null;
  riferimento_esterno: string | null;
  note: string | null;
  creato_da: string | null;
  created_at: string;
  updated_at: string;
  titolario?: Pick<VoceTitolario, 'id' | 'codice' | 'descrizione'> | null;
  /** Numero di documenti, quando richiesto con il conteggio */
  documenti?: { count: number }[];
}

/** Campi compilabili (numero, anno, stato e autore li gestisce il database) */
export type DatiFascicolo = Pick<
  Fascicolo,
  'oggetto' | 'titolario_id' | 'responsabile' | 'ufficio' | 'data_apertura' | 'riferimento_esterno' | 'note'
>;

export interface FiltriFascicolo {
  anno?: number;
  stato?: StatoFascicolo;
  titolario_id?: string;
  testo?: string;
}

/** Collegamento tra un fascicolo e un documento (protocollo oppure contratto) */
export interface DocumentoFascicolo {
  id: string;
  fascicolo_id: string;
  protocollo_id: string | null;
  contratto_id: string | null;
  inserito_da: string | null;
  created_at: string;
  protocollo?: (Pick<Protocollo, 'id' | 'registro' | 'numero_completo' | 'tipo_flusso' | 'data_registrazione' | 'oggetto' |
    'mittente_nome' | 'destinatario_nome'> & { protocollo_allegati?: Allegato[] }) | null;
  contratto?: (Pick<Contratto, 'id' | 'numero_completo' | 'data_repertorio' | 'oggetto' | 'contraente_nome'> &
    { protocollo_contratti_allegati?: AllegatoContratto[] }) | null;
  fascicolo?: Pick<Fascicolo, 'id' | 'numero_completo' | 'oggetto' | 'stato'> | null;
}

// ── Protocollo PEC ────────────────────────────────────────────────────────────

export type StatoPec = 'da_verificare' | 'pronto' | 'anomalia' | 'protocollato' | 'scartato';

export interface FilePec {
  id: string;
  messaggio_id: string;
  ruolo: 'eml' | 'pdf' | 'allegato';
  posizione: number;
  nome_file: string;
  storage_path: string;
  dimensione_bytes: number | null;
  tipo_mime: string | null;
  sha256: string | null;
  generato: boolean;
  created_at: string;
}

export interface MessaggioPec {
  id: string;
  id_acquisizione: string;
  tipo: 'messaggio' | 'ricevuta';
  direzione: TipoFlusso | null;
  direzione_proposta: string | null;
  mittente: string | null;
  destinatari: string | null;
  cc: string | null;
  oggetto: string | null;
  corpo_anteprima: string | null;
  message_id: string | null;
  sha256_eml: string | null;
  data_email: string | null;
  data_certificata: string | null;
  /** Data usata per il protocollo: certificata se presente, altrimenti dell'email */
  data_pec: string | null;
  tipo_certificazione: string | null;
  riferimento_message_id: string | null;
  ricevuta_di: string | null;
  stato: StatoPec;
  anomalie: string[];
  avvisi: string[];
  note_verifica: string | null;
  drive_cartella: string | null;
  numero_allegati_indice: number | null;
  protocollo_id: string | null;
  importazione_id: string | null;
  importato_il: string;
  verificato_da: string | null;
  verificato_il: string | null;
  created_at: string;
  updated_at: string;
  protocollo_pec_file?: FilePec[];
}

export interface ImportazionePec {
  id: string;
  avviata_da: string | null;
  avviata_il: string;
  conclusa_il: string | null;
  stato: 'in_corso' | 'completata' | 'interrotta';
  righe_indice: number;
  nuove: number;
  gia_presenti: number;
  anomalie: number;
  errore: string | null;
  profilo?: Pick<Profilo, 'nome_completo'> | null;
}
