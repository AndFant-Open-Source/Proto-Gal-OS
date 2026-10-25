// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import type { StatoFascicolo } from '@/types';

export function StatoFascicoloBadge({ stato }: { stato: StatoFascicolo }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        stato === 'aperto' ? 'border-green-200 bg-green-100 text-green-800' : 'border-gray-300 bg-gray-100 text-gray-700'
      }`}
    >
      {stato === 'aperto' ? 'Aperto' : 'Chiuso'}
    </span>
  );
}
