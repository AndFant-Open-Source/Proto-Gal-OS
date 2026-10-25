// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/Layout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import NuovoProtocollo from '@/pages/NuovoProtocollo';
import ListaProtocolli from '@/pages/ListaProtocolli';
import DettaglioProtocollo from '@/pages/DettaglioProtocollo';
import GestioneUtenti from '@/pages/GestioneUtenti';
import Report from '@/pages/Report';
import ModificaProtocollo from '@/pages/ModificaProtocollo';
import GestioneNumerazione from '@/pages/admin/GestioneNumerazione';
import RepertorioContratti from '@/pages/contratti/RepertorioContratti';
import NuovoContratto from '@/pages/contratti/NuovoContratto';
import DettaglioContratto from '@/pages/contratti/DettaglioContratto';
import ModificaContratto from '@/pages/contratti/ModificaContratto';
import CopyrightLicenza from '@/pages/CopyrightLicenza';
import ImportaBackup from '@/pages/admin/ImportaBackup';
import Titolario from '@/pages/admin/Titolario';
import ElencoFascicoli from '@/pages/fascicoli/ElencoFascicoli';
import DettaglioFascicolo from '@/pages/fascicoli/DettaglioFascicolo';

function AccessoNonAbilitato({ onEsci }: { onEsci: () => Promise<void> }) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Accesso non abilitato</h1>
        <p className="mt-2 text-sm text-gray-600">
          Il tuo account non è abilitato o è stato disattivato. Rivolgiti all'amministratore del registro.
        </p>
        <button
          type="button"
          onClick={() => { void onEsci(); }}
          className="mt-4 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Esci
        </button>
      </div>
    </div>
  );
}

function PrivateRoute({ children, soloAdmin = false, soloOperatore = false }: { children: React.ReactNode; soloAdmin?: boolean; soloOperatore?: boolean }) {
  const { user, profilo, loading, isOperatore, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Account senza profilo o disattivato: il database non mostra alcun dato,
  // quindi lo si dice chiaramente invece di presentare pagine vuote
  if (!profilo || !profilo.attivo) return <AccessoNonAbilitato onEsci={logout} />;
  if (soloAdmin && profilo?.ruolo !== 'admin') return <Navigate to="/" replace />;
  // Un "lettore" non deve raggiungere le pagine di inserimento/modifica
  // (il database lo bloccherebbe comunque al salvataggio)
  if (soloOperatore && !isOperatore) return <Navigate to="/" replace />;


  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#003399] border-t-transparent" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/nuovo"
        element={
          <PrivateRoute soloOperatore>
            <Layout>
              <NuovoProtocollo />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/registro"
        element={
          <PrivateRoute>
            <Layout>
              <ListaProtocolli />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/protocollo/:id"
        element={
          <PrivateRoute>
            <Layout>
              <DettaglioProtocollo />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/report"
        element={
          <PrivateRoute>
            <Layout>
              <Report />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/modifica/:id"
        element={
          <PrivateRoute soloOperatore>
            <Layout>
              <ModificaProtocollo />
            </Layout>
          </PrivateRoute>
        }
      />
      {/* Repertorio contratti ("/contratti/nuovo" prima di "/contratti/:id") */}
      <Route
        path="/contratti"
        element={<PrivateRoute><Layout><RepertorioContratti /></Layout></PrivateRoute>}
      />
      <Route
        path="/contratti/nuovo"
        element={<PrivateRoute soloOperatore><Layout><NuovoContratto /></Layout></PrivateRoute>}
      />
      <Route
        path="/contratti/:id"
        element={<PrivateRoute><Layout><DettaglioContratto /></Layout></PrivateRoute>}
      />
      <Route
        path="/contratti/:id/modifica"
        element={<PrivateRoute soloOperatore><Layout><ModificaContratto /></Layout></PrivateRoute>}
      />
      <Route
        path="/utenti"
        element={
          <PrivateRoute soloAdmin>
            <Layout>
              <GestioneUtenti />
            </Layout>
          </PrivateRoute>
        }
      />

      <Route
        path="/admin/numerazione"
        element={
          <PrivateRoute soloAdmin>
            <Layout>
              <GestioneNumerazione />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/fascicoli"
        element={<PrivateRoute><Layout><ElencoFascicoli /></Layout></PrivateRoute>}
      />
      <Route
        path="/fascicoli/:id"
        element={<PrivateRoute><Layout><DettaglioFascicolo /></Layout></PrivateRoute>}
      />
      <Route
        path="/admin/titolario"
        element={<PrivateRoute soloAdmin><Layout><Titolario /></Layout></PrivateRoute>}
      />
      <Route
        path="/admin/importa"
        element={<PrivateRoute soloAdmin><Layout><ImportaBackup /></Layout></PrivateRoute>}
      />
      <Route
        path="/licenza"
        element={<PrivateRoute><Layout><CopyrightLicenza /></Layout></PrivateRoute>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { fontFamily: 'inherit' },
              duration: 4000,
            }}
          />
      </AuthProvider>
    </BrowserRouter>
  );
}
