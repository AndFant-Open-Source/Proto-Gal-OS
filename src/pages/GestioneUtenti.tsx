// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useEffect, useState } from 'react';
import { UserPlus, Shield, User, Eye, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { formatData } from '@/lib/utils';
import { toast } from 'sonner';
import type { Profilo, Ruolo } from '@/types';

const RUOLO_ICONA: Record<Ruolo, React.ReactNode> = {
  admin: <Shield className="h-4 w-4 text-[#003399]" />,
  operatore: <User className="h-4 w-4 text-green-600" />,
  lettore: <Eye className="h-4 w-4 text-gray-500" />,
};

const RUOLO_DESCRIZIONE: Record<Ruolo, string> = {
  admin: 'Accesso completo + gestione utenti',
  operatore: 'Crea e modifica protocolli',
  lettore: 'Solo visualizzazione',
};

export default function GestioneUtenti() {
  const [utenti, setUtenti] = useState<Profilo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogoAperto, setDialogoAperto] = useState(false);
  const [email, setEmail] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [ruolo, setRuolo] = useState<Ruolo>('operatore');
  const [salvataggio, setSalvataggio] = useState(false);

  const caricaUtenti = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('protocollo_profili')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Errore nel caricamento utenti');
    else setUtenti(data as Profilo[]);
    setLoading(false);
  };

  useEffect(() => { caricaUtenti(); }, []);

  const cambiaRuolo = async (id: string, nuovoRuolo: Ruolo) => {
    const { error } = await supabase
      .from('protocollo_profili')
      .update({ ruolo: nuovoRuolo })
      .eq('id', id);
    if (error) { toast.error('Errore aggiornamento ruolo'); return; }
    toast.success('Ruolo aggiornato');
    caricaUtenti();
  };

  const toggleAttivo = async (id: string, attivo: boolean) => {
    const { error } = await supabase
      .from('protocollo_profili')
      .update({ attivo: !attivo })
      .eq('id', id);
    if (error) { toast.error('Errore aggiornamento stato'); return; }
    toast.success(attivo ? 'Utente disattivato' : 'Utente riattivato');
    caricaUtenti();
  };

  const creaUtente = async () => {
    if (!email || !nomeCompleto) { toast.error('Email e nome sono obbligatori'); return; }
    setSalvataggio(true);
    try {
      // Crea l'utente in Supabase Auth (richiede service_role key, non disponibile lato client)
      // In produzione questa operazione va fatta da backend o dalla dashboard Supabase
      // Per ora creiamo solo il profilo — l'admin invita l'utente dalla dashboard Supabase Auth
      toast.info(
        'Per creare un nuovo utente, invitalo dalla Dashboard Supabase (Authentication → Users → Invite User), poi aggiorna manualmente il suo profilo nella tabella protocollo_profili.',
        { duration: 8000 }
      );
      setDialogoAperto(false);
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
          <p className="text-sm text-gray-500">{utenti.length} utenti registrati</p>
        </div>
        <Button onClick={() => setDialogoAperto(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Nuovo Utente
        </Button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <strong>Nota:</strong> La creazione di nuovi account utente avviene tramite la Dashboard Supabase
          (Authentication → Users → Invite User). Da questa pagina puoi gestire i ruoli e lo stato degli utenti già registrati.
        </div>
      </div>

      {/* Tabella utenti */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utenti Registrati</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Utente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Ruolo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Ufficio</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Stato</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Creato il</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {utenti.map((u) => (
                    <tr key={u.id} className={`transition-colors ${u.attivo ? 'hover:bg-gray-50' : 'bg-gray-50/50 opacity-60'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#003399]/10 text-sm font-semibold text-[#003399]">
                            {u.nome_completo.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{u.nome_completo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={u.ruolo}
                          onValueChange={(v) => cambiaRuolo(u.id, v as Ruolo)}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <div className="flex items-center gap-1.5">
                              {RUOLO_ICONA[u.ruolo]}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {(['admin', 'operatore', 'lettore'] as Ruolo[]).map((r) => (
                              <SelectItem key={r} value={r}>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    {RUOLO_ICONA[r]}
                                    <span className="capitalize font-medium">{r}</span>
                                  </div>
                                  <p className="text-xs text-gray-400">{RUOLO_DESCRIZIONE[r]}</p>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.ufficio ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          u.attivo
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {u.attivo ? 'Attivo' : 'Disattivato'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatData(u.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={u.attivo ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}
                            >
                              {u.attivo ? 'Disattiva' : 'Riattiva'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {u.attivo ? 'Disattiva utente' : 'Riattiva utente'}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {u.attivo
                                  ? `Vuoi disattivare l'utente ${u.nome_completo}? Non potrà più accedere al sistema.`
                                  : `Vuoi riattivare l'utente ${u.nome_completo}?`}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                className={u.attivo ? 'bg-red-600 hover:bg-red-700' : ''}
                                onClick={() => toggleAttivo(u.id, u.attivo)}
                              >
                                Conferma
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogo nuovo utente */}
      <Dialog open={dialogoAperto} onOpenChange={setDialogoAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi Utente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              La creazione utenti avviene tramite Supabase Auth. Usa la Dashboard Supabase per inviare l'invito.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuovoEmail">Email</Label>
              <Input id="nuovoEmail" type="email" placeholder="utente@ente.it" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuovoNome">Nome completo</Label>
              <Input id="nuovoNome" placeholder="Mario Rossi" value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ruolo</Label>
              <Select value={ruolo} onValueChange={(v) => setRuolo(v as Ruolo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operatore">Operatore</SelectItem>
                  <SelectItem value="lettore">Lettore</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAperto(false)}>Annulla</Button>
            <Button onClick={creaUtente} disabled={salvataggio}>Procedi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
