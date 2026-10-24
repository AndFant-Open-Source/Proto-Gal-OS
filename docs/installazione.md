# Installazione

Guida per installare ProtoGal da zero, in sviluppo e in produzione
(Linee guida AgID su acquisizione e riuso del software, Allegato A §A.8).

## Prerequisiti

| Componente | Versione | Note |
|------------|----------|------|
| Node.js | 20 o superiore | Necessario solo per compilare; l'app compilata è un insieme di file statici |
| npm | 10 o superiore | Incluso in Node.js |
| Supabase | — | Database PostgreSQL, autenticazione e archivio file. Software libero (Apache-2.0): si può usare il servizio cloud supabase.com oppure installarlo sui propri server |
| Hosting di file statici | — | Qualsiasi servizio (Vercel, Netlify, un server web Nginx/Apache). Il repository include la configurazione per Vercel (`vercel.json`) |

Nessuna dipendenza da software commerciale è obbligatoria: Supabase e tutte le librerie usate sono
software libero (licenze MIT, ISC, Apache-2.0, BSD).

## 1. Database (Supabase)

**Un progetto Supabase per ogni GAL.** Ripetere questi passi per ciascun ente: i dati restano
separati perché stanno su server diversi.

1. Creare un progetto Supabase **nuovo**, intestato all'account del GAL (regione consigliata:
   **Europe West – Frankfurt**, per la residenza dei dati nell'UE).
2. In *Authentication → Sign In / Providers* **disattivare la registrazione libera** ("Allow new
   users to sign up"): gli utenti si creano solo su invito.
3. Eseguire nella SQL Editor l'intero file [`supabase/schema.sql`](../supabase/schema.sql).
   Crea tabelle, regole di sicurezza e archivio file privato.
4. Creare il primo amministratore:
   1. *Authentication → Users → Invite user*: inserire l'e-mail dell'amministratore del GAL.
   2. Copiare l'UUID dell'utente creato ed eseguire:

      ```sql
      INSERT INTO protocollo_profili (id, nome_completo, ruolo)
      VALUES ('UUID-DELL-UTENTE', 'Nome Cognome', 'admin');
      ```
5. Per ogni altra persona del GAL: invito da *Invite user*, poi lo stesso comando con ruolo
   `operatore` o `lettore`. Ruoli e stato si gestiscono poi dall'app (*Gestione Utenti*).

## 2. Ambiente di sviluppo

```bash
git clone https://github.com/AndFant-Open-Source/Proto-Gal-OS.git
cd Proto-Gal-OS
npm install
cp .env.example .env    # su Windows: copy .env.example .env
```

Compilare `.env` (vedi i commenti nel file). Usare **solo** la chiave pubblica `anon` di Supabase,
mai la `service_role`.

```bash
npm run dev
```

L'applicazione è disponibile su `http://localhost:5173`. Su Windows si può usare anche `avvia.bat`.

## 3. Compilazione

```bash
npm run build
```

Esegue il controllo dei tipi TypeScript e produce i file statici nella cartella `dist/`.

## 4. Produzione

**Cloudflare Pages (consigliato)** — gratuito anche per l'uso da parte di un ente. Un progetto
Pages per ogni GAL, tutti collegati allo stesso repository ma ciascuno con le variabili del proprio
progetto Supabase.

1. *Workers & Pages → Create → Pages → Connect to Git*: collegare GitHub e scegliere il repository.
2. Impostazioni di build:
   - *Framework preset*: `React (Vite)` (oppure `None`)
   - *Build command*: `npm run build`
   - *Build output directory*: `dist`
3. *Environment variables* (Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_NOME_ENTE` (facoltative `VITE_UFFICI`, `VITE_URL_CODICE_SORGENTE`).
   Le variabili entrano nella build: dopo averle cambiate serve un nuovo deploy.
4. *Save and Deploy*. Ogni push sul ramo `main` pubblica una nuova versione.
5. In Supabase, *Authentication → URL Configuration*: impostare **Site URL** con l'indirizzo
   pubblicato (es. `https://protogal-nome-gal.pages.dev`) e aggiungerlo a **Redirect URLs**.
   Senza questo passaggio i link delle e-mail di invito puntano a un indirizzo sbagliato.

Cloudflare applica automaticamente le intestazioni di sicurezza di `public/_headers` (politica dei
contenuti, niente incorporamento in altri siti, solo HTTPS) e serve `index.html` per le pagine
interne dell'app. La versione di Node per la build è indicata in `.nvmrc`.

**Vercel**: configurazione presente in `vercel.json`. Attenzione: il piano gratuito "Hobby" è
riservato all'uso personale non commerciale.

**Altro hosting**: pubblicare il contenuto di `dist/` e configurare il server perché ogni percorso
non trovato restituisca `index.html` (applicazione a pagina singola).

Dopo la pubblicazione verificare che `https://<indirizzo>/.well-known/security.txt` risponda e che
i campi del file `public/.well-known/security.txt` siano compilati.

## Configurazione

| Variabile | Obbligatoria | Descrizione |
|-----------|:---:|-------------|
| `VITE_SUPABASE_URL` | sì | URL del progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | sì | Chiave pubblica `anon` |
| `VITE_NOME_ENTE` | sì | Nome dell'ente mostrato nell'interfaccia |
| `VITE_ANNO_CORRENTE` | no | Anno predefinito |
| `VITE_UFFICI` | no | Uffici dell'ente separati da `;` |
| `VITE_URL_CODICE_SORGENTE` | no | Link al codice sorgente mostrato a piè di pagina |
