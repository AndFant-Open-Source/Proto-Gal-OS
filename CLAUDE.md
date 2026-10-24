# CLAUDE.md — Stack di Sviluppo Preferito

Questo file definisce lo stack tecnologico, le convenzioni e le regole
da seguire per tutte le app sviluppate con questo progetto.
Claude Code deve leggere questo file prima di scrivere qualsiasi codice.

---

## 🏗 STACK TECNOLOGICO

### Frontend
- **Framework:** React 18+ con TypeScript
- **Styling:** Tailwind CSS (utility-first, niente CSS custom salvo eccezioni)
- **Build tool:** Vite (più veloce di CRA)
- **UI Components:** shadcn/ui (componenti accessibili e personalizzabili)
- **Icone:** lucide-react
- **Grafici:** recharts
- **Routing:** react-router-dom v6

### Backend & Database
- **Piattaforma:** Supabase (PostgreSQL managed)
- **Autenticazione:** Supabase Auth con ruoli personalizzati
- **Storage file:** Supabase Storage (bucket privati)
- **Funzioni server:** Supabase Edge Functions (se necessario)
- **ORM/Query:** Supabase JS Client (`@supabase/supabase-js`)

### Deploy
- **Hosting app:** Vercel (collegato a repository GitHub)
- **Database:** Supabase cloud (regione: Europe West - Frankfurt)
- **Dominio:** configurabile su Vercel

### Librerie Utility
- **Export Excel:** xlsx (SheetJS)
- **Export PDF:** jsPDF + jspdf-autotable
- **Date:** date-fns (mai moment.js)
- **Form:** react-hook-form + zod (validazione)
- **Notifiche:** sonner (toast leggeri)
- **Tabelle:** @tanstack/react-table v8

---

## 📁 STRUTTURA CARTELLE STANDARD

Ogni nuova app deve seguire questa struttura:

```
/src
  /components       → componenti riutilizzabili
  /pages            → una pagina = un file
  /hooks            → custom hooks (useNomeHook.ts)
  /lib
    supabase.ts     → client Supabase (singleton)
    utils.ts        → funzioni helper generiche
  /types
    index.ts        → tutti i tipi TypeScript del progetto
  /constants
    index.ts        → costanti, enum, configurazioni
  App.tsx
  main.tsx
```

---

## 🗄 CONVENZIONI DATABASE SUPABASE

### Nomenclatura tabelle
- Usa sempre un **prefisso** per identificare l'app:
  ```
  nomeapp_nometabella
  ```
  Esempio: `protocollo_registro`, `fatture_clienti`, `crm_contatti`
- Nomi in **snake_case** (mai camelCase nel DB)
- Il prefisso evita conflitti su database condivisi

### Campi obbligatori in ogni tabella
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
created_at  timestamptz DEFAULT now()
updated_at  timestamptz DEFAULT now()
```

### Row Level Security (RLS)
- **Sempre abilitata** su tutte le tabelle
- Mai lasciare tabelle senza policy RLS
- Schema policy standard:
  ```sql
  -- Lettura: tutti gli utenti autenticati
  CREATE POLICY "lettura_autenticati" ON nometabella
    FOR SELECT USING (auth.role() = 'authenticated');

  -- Scrittura: solo ruoli abilitati
  CREATE POLICY "scrittura_operatori" ON nometabella
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM nomeapp_profili
        WHERE id = auth.uid() AND ruolo IN ('admin', 'operatore')
      )
    );
  ```

### Sistema ruoli utente (standard)
Ogni app che richiede autenticazione deve avere questa tabella profili:
```sql
CREATE TABLE nomeapp_profili (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  ruolo       text NOT NULL CHECK (ruolo IN ('admin', 'operatore', 'lettore')),
  attivo      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

Ruoli e permessi:
| Ruolo      | Legge | Crea | Modifica | Elimina | Gestisce utenti |
|------------|-------|------|----------|---------|-----------------|
| admin      | ✅    | ✅   | ✅       | ✅      | ✅              |
| operatore  | ✅    | ✅   | ✅       | ❌      | ❌              |
| lettore    | ✅    | ❌   | ❌       | ❌      | ❌              |

---

## 🔐 FILE .ENV

Ogni progetto deve avere un file `.env` nella root con queste variabili:

```env
# Supabase
VITE_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5c...

# App
VITE_NOME_APP=Nome Applicazione
VITE_NOME_ENTE=Nome Ente o Azienda
VITE_ANNO_CORRENTE=2025
```

Il file `.env` non va mai committato su GitHub → aggiungerlo sempre al `.gitignore`.

---

## ⚙️ CLIENT SUPABASE (lib/supabase.ts)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## 🎨 DESIGN & UX — REGOLE

### Colori disponibili
Scegli una palette coerente per ogni progetto. Esempio palette PA:
```
Primary:    #003399  (blu istituzionale)
Secondary:  #009246  (verde)
Accent:     #CE2B37  (rosso)
Background: #F8F9FA  (grigio chiarissimo)
Testo:      #1A1A2E  (quasi nero)
```

### Layout standard
- **Sidebar fissa** a sinistra con navigazione principale
- **Header** con: nome app, utente loggato, ruolo, pulsante logout
- **Contenuto** nella zona centrale con padding adeguato
- **Responsive:** funzionante su desktop e tablet (min 768px)

### UX obbligatoria
- Loading spinner durante tutte le operazioni async
- Toast di conferma dopo ogni azione andata a buon fine
- Modale di conferma prima di eliminazioni o azioni irreversibili
- Messaggi di errore chiari e comprensibili (mai mostrare errori tecnici all'utente)
- Form con validazione in tempo reale (zod + react-hook-form)

### Lingua
- **Tutta l'interfaccia in italiano** (label, messaggi, errori, placeholder)

---

## 📦 STORAGE ALLEGATI

```typescript
// Upload file
const { data, error } = await supabase.storage
  .from('nome-bucket')
  .upload(`${recordId}/${nomeFile}`, file);

// Download file
const { data } = await supabase.storage
  .from('nome-bucket')
  .download(`${recordId}/${nomeFile}`);

// URL temporaneo (per anteprima)
const { data } = await supabase.storage
  .from('nome-bucket')
  .createSignedUrl(`${recordId}/${nomeFile}`, 3600); // 1 ora
```

Regole bucket:
- Sempre **privati** (mai pubblici per dati sensibili)
- Dimensione massima consigliata per file: **20MB**
- Formati accettati di default: `PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TIF`

---

## ✅ CHECKLIST PRIMA DI INIZIARE OGNI PROGETTO

```
☐ Definire nome app e prefisso tabelle database
☐ Creare progetto Supabase (regione: Europe West)
☐ Creare file .env con le chiavi Supabase
☐ Creare tabella nomeapp_profili con sistema ruoli
☐ Abilitare RLS su tutte le tabelle
☐ Creare bucket Storage (privato) se servono allegati
☐ Creare repository GitHub
☐ Collegare repo a Vercel per deploy automatico
☐ Creare primo utente Admin in Supabase Auth
☐ Testare login prima di procedere con le funzionalità
```

---

## 🚫 REGOLE DA NON VIOLARE MAI

1. **Mai modificare tabelle** senza prefisso → potrebbero appartenere ad altri sistemi
2. **Mai disabilitare RLS** su tabelle con dati utente
3. **Mai committare il file .env** su GitHub
4. **Mai usare `any` in TypeScript** → definire sempre i tipi corretti
5. **Mai fare query senza gestire gli errori** → ogni chiamata Supabase deve avere blocco `error`
6. **Mai mostrare errori tecnici** all'utente finale → tradurli sempre in messaggi comprensibili
7. **Mai creare bucket Storage pubblici** per dati sensibili o documenti interni

---

*Questo file va posizionato nella root del progetto.
Claude Code lo leggerà automaticamente all'avvio di ogni sessione.*
