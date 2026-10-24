// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { Badge } from '@/components/ui/badge';
import { LABEL_STATO, COLORE_STATO } from '@/lib/utils';
import type { StatoProtocollo } from '@/types';

interface StatoBadgeProps {
  stato: StatoProtocollo;
}

export function StatoBadge({ stato }: StatoBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${COLORE_STATO[stato]}`}
    >
      {LABEL_STATO[stato]}
    </span>
  );
}

export { Badge };
