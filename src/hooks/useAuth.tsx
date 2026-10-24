// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState, useEffect, useContext, createContext } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profilo } from '@/types';

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profilo: Profilo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isOperatore: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

// ── Helper ────────────────────────────────────────────────────────────────────

async function fetchProfilo(userId: string): Promise<Profilo | null> {
  const { data, error } = await supabase
    .from('protocollo_profili')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('Errore caricamento profilo:', error.message);
    return null;
  }
  return data as Profilo;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [loading, setLoading] = useState(true);

  // Effetto 1: SINCRONO — aggiorna user/session senza async.
  // Supabase sconsiglia di fare chiamate async dentro onAuthStateChange.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        // Se non c'è sessione, possiamo già togliere il loading
        if (!newSession) {
          setProfilo(null);
          setLoading(false);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Effetto 2: ASINCRONO — carica il profilo quando user cambia.
  // Separato dal listener auth per evitare comportamenti imprevisti.
  useEffect(() => {
    if (!user) return;

    let annullato = false;
    fetchProfilo(user.id).then((p) => {
      if (!annullato) {
        setProfilo(p);
        setLoading(false);
      }
    });

    return () => { annullato = true; };
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    // La navigazione avviene automaticamente quando lo stato si aggiorna.
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profilo,
        loading,
        login,
        logout,
        // Un profilo disattivato non ha permessi (coerente con le funzioni RLS)
        isAdmin: profilo?.attivo === true && profilo.ruolo === 'admin',
        isOperatore: profilo?.attivo === true && (profilo.ruolo === 'admin' || profilo.ruolo === 'operatore'),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook pubblico ─────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>');
  return ctx;
}
