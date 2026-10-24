// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState } from 'react';
import { BookOpen, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { NOME_ENTE } from '@/lib/ente';
import { InfoSoftware } from '@/components/InfoSoftware';


export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostraPassword, setMostraPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Inserisci email e password');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      // La navigazione avviene automaticamente: quando onAuthStateChange
      // aggiorna user, la route /login rileva user !== null e redirige a /.
    } catch (err) {
      toast.error('Credenziali non valide. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#003399] to-[#001d63] p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">ProtoGal</h1>
          <p className="mt-1 text-sm text-blue-200">Registro di Protocollo</p>
          <p className="mt-1 text-xs text-blue-300">{NOME_ENTE}</p>
        </div>

        <Card className="shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle>Accedi</CardTitle>
            <CardDescription>Inserisci le tue credenziali per continuare</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nome@ente.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={mostraPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setMostraPassword(!mostraPassword)}
                  >
                    {mostraPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Accesso in corso...
                  </span>
                ) : 'Accedi'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-blue-300">
          Registro di Protocollo Interno — {NOME_ENTE}
        </p>
        <InfoSoftware scuro className="mt-2 text-center" />
      </div>
    </div>
  );
}
