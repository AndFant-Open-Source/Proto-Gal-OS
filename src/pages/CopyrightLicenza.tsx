// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { Code2, ExternalLink, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { URL_CODICE_SORGENTE } from '@/components/InfoSoftware';

function Collegamento({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[#003399] underline hover:no-underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

/**
 * Note legali appropriate (AGPL-3.0, sezione 5 lettera d): titolarità, licenza, termini
 * aggiuntivi, assenza di garanzia e link al codice sorgente (sezione 13).
 */
export default function CopyrightLicenza() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="h-7 w-7 text-[#003399]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Copyright e licenza</h1>
          <p className="text-sm text-gray-500">ProtoGal · versione {__VERSIONE_APP__}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Titolarità</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p className="font-semibold">ProtoGal © 2026 Andrea Fantini — software libero AGPL-3.0</p>
          <p>Titolare dei diritti d'autore: Andrea Fantini.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Licenza</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          <p>
            Questo programma è software libero, rilasciato sotto la{' '}
            <Collegamento href="https://www.gnu.org/licenses/agpl-3.0.html">
              GNU Affero General Public License versione 3 o successive
            </Collegamento>{' '}
            (AGPL-3.0-or-later). Chiunque, comprese le pubbliche amministrazioni, può usarlo, studiarlo,
            modificarlo e ridistribuirlo gratuitamente. Chi lo modifica e lo rende disponibile via rete
            deve pubblicare il codice sorgente delle modifiche.
          </p>
          <p>Termini aggiuntivi previsti dalla sezione 7 della licenza:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              l'avviso «ProtoGal © 2026 Andrea Fantini — software libero AGPL-3.0» va mantenuto
              nell'interfaccia (nelle versioni modificate: «Basato su ProtoGal …»);
            </li>
            <li>le versioni modificate devono essere riconoscibili come tali;</li>
            <li>le versioni modificate distribuite a terzi devono avere un nome diverso da "ProtoGal".</li>
          </ul>
          <p>
            La documentazione è rilasciata sotto licenza Creative Commons Attribuzione 4.0 (CC-BY-4.0).
            I componenti dell'interfaccia derivati da shadcn/ui mantengono la licenza MIT.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assenza di garanzia</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">
          Il programma è distribuito nella speranza che sia utile, ma senza alcuna garanzia, nemmeno
          quella implicita di commerciabilità o di idoneità a uno scopo particolare, nei limiti
          consentiti dalla legge (sezioni 15 e 16 della licenza).
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Codice sorgente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">
          <p className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-gray-500" aria-hidden="true" />
            <Collegamento href={URL_CODICE_SORGENTE}>{URL_CODICE_SORGENTE}</Collegamento>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
