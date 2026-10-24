// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContrattoForm } from '@/components/ContrattoForm';
import { useAuth } from '@/hooks/useAuth';
import { getContratto, aggiornaContratto, logAzioneContratto } from '@/hooks/useContratti';
import { toast } from 'sonner';
import type { Contratto, DatiContratto } from '@/types';

export default function ModificaContratto() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contratto, setContratto] = useState<Contratto | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    if (!id) return;
    getContratto(id)
      .then(setContratto)
      .catch(() => {
        toast.error('Contratto non trovato o non accessibile');
        navigate('/contratti');
      })
      .finally(() => setCaricamento(false));
  }, [id, navigate]);

  const salva = async (dati: DatiContratto) => {
    if (!contratto || !user) return;
    setSalvataggio(true);
    try {
      await aggiornaContratto(contratto.id, dati);
      await logAzioneContratto(contratto.id, user.id, 'MODIFICA_CONTRATTO', {
        numero_completo: contratto.numero_completo,
      });
      toast.success('Contratto aggiornato');
      navigate(`/contratti/${contratto.id}`);
    } catch (err) {
      console.error('Modifica contratto fallita:', err);
      toast.error('Impossibile salvare le modifiche al contratto. Riprova o contatta l\'amministratore.');
    } finally {
      setSalvataggio(false);
    }
  };

  if (caricamento) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }
  if (!contratto) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Indietro
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modifica Contratto</h1>
          <p className="text-sm text-gray-500">
            Repertorio:{' '}
            <span className="font-mono font-semibold text-[#003399]">{contratto.numero_completo}</span>
            <span className="ml-2 text-xs text-gray-400">(gli allegati si gestiscono dal dettaglio)</span>
          </p>
        </div>
      </div>

      <ContrattoForm
        contratto={contratto}
        salvataggio={salvataggio}
        etichettaSalva="Salva Modifiche"
        onAnnulla={() => navigate(-1)}
        onSalva={salva}
      />
    </div>
  );
}
