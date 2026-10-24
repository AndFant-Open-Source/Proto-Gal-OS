// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Andrea Fantini
// Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FilePlus,
  FileText,
  Users,
  BarChart2,
  LogOut,
  Menu,
  X,
  BookOpen,
  Building2,
  Hash,
  Settings,
  ScrollText,
  FileSignature,
  Scale,
  FileArchive,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { NOME_ENTE } from '@/lib/ente';
import { toast } from 'sonner';

const VOCI_PRINCIPALI = [
  { path: '/', label: 'Dashboard', icona: LayoutDashboard, ruoli: ['admin', 'operatore', 'lettore'] },
  { path: '/nuovo', label: 'Nuovo Protocollo', icona: FilePlus, ruoli: ['admin', 'operatore'] },
  { path: '/registro', label: 'Registro Protocolli', icona: FileText, ruoli: ['admin', 'operatore', 'lettore'] },
  { path: '/report', label: 'Report & Export', icona: BarChart2, ruoli: ['admin', 'operatore', 'lettore'] },
];

const VOCI_CONTRATTI = [
  { path: '/contratti/nuovo', label: 'Nuovo Contratto', icona: FileSignature, ruoli: ['admin', 'operatore'] },
  { path: '/contratti', label: 'Repertorio Contratti', icona: ScrollText, ruoli: ['admin', 'operatore', 'lettore'] },
];

const VOCI_ADMIN = [
  { path: '/admin/numerazione', label: 'Numerazione', icona: Hash },
  { path: '/utenti', label: 'Gestione Utenti', icona: Users },
  { path: '/admin/importa', label: 'Importa backup', icona: FileArchive },
];

// ── Ente servito da questa installazione (edizione per singolo GAL) ───────────

function EtichettaEnte() {
  return (
    <div className="mx-3 my-2 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
      <Building2 className="h-4 w-4 flex-shrink-0 text-blue-300" />
      <div className="min-w-0">
        <p className="text-xs uppercase leading-none tracking-wide text-blue-300">Ente</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{NOME_ENTE}</p>
      </div>
    </div>
  );
}

// ── Layout principale ─────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const { profilo, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Sessione terminata');
    navigate('/login');
  };

  const vociVisibili = VOCI_PRINCIPALI.filter(
    (v) => profilo && v.ruoli.includes(profilo.ruolo)
  );
  const vociContratti = VOCI_CONTRATTI.filter(
    (v) => profilo && v.ruoli.includes(profilo.ruolo)
  );

  return (
    // 100dvh: altezza reale visibile (100vh su tablet/mobile include le barre del browser
    // e taglia la parte bassa della pagina)
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-gray-50">
      {/* Sidebar — mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-[#003399] text-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo / nome ente */}
        <div className="flex items-center gap-3 border-b border-white/20 px-5 py-4">
          <BookOpen className="h-7 w-7 flex-shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-widest text-blue-200">
              Registro Protocollo
            </p>
            <p className="truncate text-sm font-bold leading-tight">{NOME_ENTE}</p>
          </div>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Ente servito da questa installazione */}
        <EtichettaEnte />

        {/* Navigazione */}
        <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
          {vociVisibili.map((voce) => (
            <NavLink
              key={voce.path}
              to={voce.path}
              end={voce.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <voce.icona className="h-5 w-5 flex-shrink-0" />
              {voce.label}
            </NavLink>
          ))}

          {/* Sezione Repertorio Contratti */}
          {vociContratti.length > 0 && (
            <>
              <div className="mt-4 mb-1 flex items-center gap-2 px-3">
                <ScrollText className="h-3.5 w-3.5 text-blue-300" />
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                  Contratti
                </p>
              </div>
              {vociContratti.map((voce) => (
                <NavLink
                  key={voce.path}
                  to={voce.path}
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'text-blue-100 hover:bg-white/10 hover:text-white'
                    }`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <voce.icona className="h-5 w-5 flex-shrink-0" />
                  {voce.label}
                </NavLink>
              ))}
            </>
          )}

          {/* Sezione Amministrazione (solo admin) */}
          {isAdmin && (
            <>
              <div className="mt-4 mb-1 flex items-center gap-2 px-3">
                <Settings className="h-3.5 w-3.5 text-blue-300" />
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                  Amministrazione
                </p>
              </div>
              {VOCI_ADMIN.map((voce) => (
                <NavLink
                  key={voce.path}
                  to={voce.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'text-blue-100 hover:bg-white/10 hover:text-white'
                    }`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <voce.icona className="h-5 w-5 flex-shrink-0" />
                  {voce.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Utente loggato */}
        <div className="border-t border-white/20 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
              {profilo?.nome_completo?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profilo?.nome_completo}</p>
              <p className="text-xs capitalize text-blue-200">{profilo?.ruolo}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-blue-100 hover:bg-white/10 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Esci
          </Button>
          {/* L'avviso completo è nella pagina di accesso e in "Copyright e licenza" */}
          <NavLink
            to="/licenza"
            className="mt-3 flex items-center gap-1.5 px-1 text-xs text-blue-200 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <Scale className="h-3 w-3" aria-hidden="true" />
            Copyright e licenza
          </NavLink>
        </div>
      </aside>

      {/* Contenuto principale */}
      {/* min-w-0: senza, un contenuto largo allarga la colonna oltre lo schermo
          e la parte destra della pagina finisce fuori vista */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header mobile */}
        <header className="flex items-center gap-4 border-b bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6 text-gray-700" />
          </button>
          <span className="font-semibold text-[#003399]">ProtoGal</span>
        </header>

        {/* Area contenuto */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
