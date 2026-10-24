// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md

/**
 * Ente (GAL) servito da questa installazione.
 * Edizione per singolo GAL: ogni GAL ha il proprio progetto Supabase e il proprio sito,
 * configurati nel file .env (o nelle variabili d'ambiente di Vercel).
 */
export const NOME_ENTE: string = import.meta.env.VITE_NOME_ENTE || 'Ente';
