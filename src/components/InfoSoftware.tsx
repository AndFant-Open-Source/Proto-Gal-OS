// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const URL_CODICE_SORGENTE =
  import.meta.env.VITE_URL_CODICE_SORGENTE || 'https://github.com/AndFant-Open-Source/Proto-Gal-OS';

/**
 * "Note legali appropriate" (AGPL-3.0, sezione 5 lettera d): avviso di attribuzione,
 * licenza, versione e link al codice sorgente.
 * - L'avviso "ProtoGal © 2026 Andrea Fantini — software libero AGPL-3.0" è richiesto dal
 *   Termine 1 di TERMINI-AGGIUNTIVI.md e non va rimosso né alterato (nelle versioni
 *   modificate diventa "Basato su ProtoGal © 2026 Andrea Fantini — ...").
 * - Il link al codice è richiesto dalle Linee guida AgID (All. A §A.2) e dalla AGPL
 *   (sezione 13: sorgente offerto a chi usa il software via rete).
 */
export function InfoSoftware({ className, scuro = false }: { className?: string; scuro?: boolean }) {
  return (
    <p className={cn('text-xs', scuro ? 'text-blue-200' : 'text-gray-500', className)}>
      ProtoGal © 2026 Andrea Fantini — software libero{' '}
      <a
        href="https://spdx.org/licenses/AGPL-3.0-or-later.html"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
      >
        AGPL-3.0
      </a>{' '}
      · v{__VERSIONE_APP__} ·{' '}
      <a
        href={URL_CODICE_SORGENTE}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline hover:no-underline"
      >
        <Code2 className="h-3 w-3" aria-hidden="true" />
        Codice sorgente
      </a>
    </p>
  );
}
