// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_NOME_ENTE: string;
  readonly VITE_ANNO_CORRENTE: string;
  /** Uffici dell'ente separati da ";" (facoltativo) */
  readonly VITE_UFFICI?: string;
  /** Indirizzo pubblico del codice sorgente, mostrato nell'interfaccia (Linee guida AgID, All. A §A.2) */
  readonly VITE_URL_CODICE_SORGENTE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versione del software, letta da package.json in fase di build (vite.config.ts) */
declare const __VERSIONE_APP__: string;
