// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContrattoForm } from '@/components/ContrattoForm';
import { useAuth } from '@/hooks/useAuth';
import { NOME_ENTE } from '@/lib/ente';
import {
  getProssimoNumeroContrattoPreview, formatNumeroContratto,
  creaContratto, caricaAllegatoContratto, logAzioneContratto,
} from '@/hooks/useContratti';
import { toast } from 'sonner';
import type { DatiContratto } from '@/types';

const annoCorrente = new Date().getFullYear();

export default function NuovoContratto() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [salvataggio, setSalvataggio] = useState(false);
  const [prossimoNumero, setProssimoNumero] = useState<number | null>(null);

  useEffect(() => {
    getProssimoNumeroContrattoPreview(annoCorrente)
      .then(setProssimoNumero)
      .catch(() => setProssimoNumero(null));
  }, []);

  const salva = async (dati: DatiContratto, files: File[]) => {
    if (!user) return;
    setSalvataggio(true);
    try {
      // Numero e anno li assegna il database nella stessa operazione del salvataggio
      const contratto = await creaContratto(dati);

      const esiti = await Promise.allSettled(files.map((f) => caricaAllegatoContratto(contratto.id, f, user.id)));
      const nonCaricati = files.filter((_, i) => esiti[i].status === 'rejected');

      await logAzioneContratto(contratto.id, user.id, 'CREAZIONE_CONTRATTO', {
        numero_completo: contratto.numero_completo,
      });

      toast.success(`Contratto ${contratto.numero_completo} registrato nel repertorio`);
      if (nonCaricati.length > 0) {
        toast.error(`Non è stato possibile caricare: ${nonCaricati.map((f) => f.name).join(', ')}. Riprova dal dettaglio del contratto.`);
      }
      navigate(`/contratti/${contratto.id}`);
    } catch (err) {
      console.error('Registrazione contratto fallita:', err);
      toast.error('Impossibile registrare il contratto. Riprova; se il problema persiste contatta l\'amministratore.');
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Indietro
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuovo Contratto</h1>
          <p className="text-sm text-gray-500">
            Repertorio contratti — {NOME_ENTE}
            {prossimoNumero !== null && (
              <>
                {' '}— prossimo numero:{' '}
                <span className="font-mono font-semibold text-[#003399]">
                  {formatNumeroContratto(annoCorrente, prossimoNumero)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <ContrattoForm
        conAllegati
        salvataggio={salvataggio}
        etichettaSalva="Registra nel Repertorio"
        onAnnulla={() => navigate(-1)}
        onSalva={salva}
      />
    </div>
  );
}
