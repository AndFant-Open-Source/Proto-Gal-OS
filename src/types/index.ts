// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
export type Ruolo = 'admin' | 'operatore' | 'lettore';
export type TipoFlusso = 'arrivo' | 'partenza';
export type Canale = 'pec' | 'email' | 'cartaceo' | 'digitale';
export type StatoProtocollo = 'ricevuto' | 'in_lavorazione' | 'evaso' | 'archiviato';

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
  /** Per i contratti: etichetta mostrata al posto di Arrivo/Partenza */
  registro?: 'protocollo' | 'repertorio';
  tipo_flusso?: 'arrivo' | 'partenza';
  data_stampa: string;
}

export interface SequenzaNumerazione {
  anno: number;
  tipo_flusso: 'arrivo' | 'partenza';
  ultimo_numero: number;
}

export interface Protocollo {
  id: string;
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
  utente_id?: string;
  azione: string;
  dettaglio?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
  profilo?: Profilo;
}

export interface FiltriProtocollo {
  anno?: number;
  tipo_flusso?: TipoFlusso | '';
  canale?: Canale | '';
  stato?: StatoProtocollo | '';
  ufficio?: string;
  testo?: string;
}

export interface StatisticheDashboard {
  totale_oggi: number;
  totale_mese: number;
  totale_anno: number;
  arrivi_anno: number;
  partenze_anno: number;
  per_mese: { mese: string; arrivi: number; partenze: number }[];
}
