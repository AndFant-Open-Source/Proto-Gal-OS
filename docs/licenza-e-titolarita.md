# Licenza e titolarità

Licenza di ProtoGal e motivazione della scelta, secondo l'art. 69 del Codice dell'Amministrazione
Digitale (D.Lgs. 82/2005, CAD) e le *Linee guida su acquisizione e riuso di software per le
pubbliche amministrazioni* di AgID (di seguito "Linee guida").

> Documento tecnico: non sostituisce il parere di un legale.

## 1. Titolare e licenza

| | |
|---|---|
| **Titolare dei diritti** | Andrea Fantini — © 2026 |
| **Licenza del software** | GNU Affero General Public License v3 o successive (`AGPL-3.0-or-later`) con **termini aggiuntivi** ai sensi della sezione 7 — [TERMINI-AGGIUNTIVI.md](../TERMINI-AGGIUNTIVI.md) |
| **Licenza della documentazione** | Creative Commons Attribuzione 4.0 (`CC-BY-4.0`) |
| **Componenti di terzi** | `src/components/ui/` derivati da shadcn/ui: licenza MIT originale mantenuta |

Il testo ufficiale della AGPL è nel file `LICENSE` **senza alcuna modifica**: lo richiedono la
licenza stessa e le Linee guida (All. A §A.4), e permette a GitHub di riconoscere la licenza.
I termini aggiuntivi stanno in un file separato e sono richiamati in testa a ogni file sorgente,
come prescrive la sezione 7 della AGPL.

## 2. Perché la AGPL-3.0

Le Linee guida (§3.5.3) indicano la EUPL-1.2 come regola generale, con un'eccezione esplicita:
**il software usato principalmente via rete (browser) va rilasciato sotto AGPL-3.0-or-later**.
ProtoGal è un'applicazione web.

- Chiunque, comprese le PA, può usarlo, studiarlo, modificarlo e ridistribuirlo gratuitamente,
  senza convenzioni (Linee guida §3.2).
- Chi lo modifica e lo rende disponibile via rete deve pubblicare le modifiche con la stessa
  licenza: i miglioramenti tornano a tutti.
- Nessun obbligo di garanzia o assistenza per il titolare (Linee guida §3.4.3).
- Tutte le librerie usate hanno licenze compatibili (MIT, ISC, Apache-2.0, BSD).

## 3. I termini aggiuntivi e la loro conformità

La AGPL consente al titolare di aggiungere solo alcuni tipi di condizioni, elencati nella
sezione 7. Sono stati usati questi:

| Termine | Sezione AGPL | Effetto |
|---------|:---:|---------|
| 1. Conservazione dell'attribuzione | 7(b) | L'interfaccia deve mostrare "ProtoGal © 2026 Andrea Fantini — software libero AGPL-3.0" (o "Basato su ProtoGal …" se modificato) |
| 2. Origine e versioni modificate | 7(c) | Le versioni modificate devono essere riconoscibili e non presentarsi come l'originale |
| 3. Nome e segni distintivi | 7(e) | Nessun diritto sul nome "ProtoGal": le versioni modificate distribuite a terzi devono chiamarsi diversamente |

**Conformità.** Il risultato resta una licenza approvata dall'OSI, come richiesto dalle Linee guida
(§3.5.2). Anche la definizione di open source ammette che le opere derivate debbano portare un nome
o un numero di versione diverso dall'originale. Le condizioni:

- **non limitano** l'uso, lo studio, la modifica o la ridistribuzione;
- comportano per chi riusa un solo adempimento, cioè mantenere una riga a piè di pagina, che non
  crea oneri economici (Linee guida §3.5.3, ultimo paragrafo).

**Cosa NON si può prevedere.** Un divieto di modifica renderebbe la licenza non aperta e quindi non
conforme all'art. 69 del CAD e alle Linee guida (§3.5.2; All. C §C.7 esclude le licenze "non opere
derivate").

**Sul nome.** Il Termine 3 nega l'uso del nome in base alla licenza. Per una tutela piena nei
confronti di chiunque, anche fuori dalla licenza, si può valutare la registrazione del marchio.

## 4. Titolarità rispetto all'art. 69 del CAD

Il titolare indicato è una persona fisica, l'autore. È la situazione di un software **sviluppato in
autonomia** e messo a disposizione delle amministrazioni come software libero:

- le amministrazioni lo adottano come "software open source" nella valutazione comparativa
  (art. 68 CAD);
- le **modifiche** che un'amministrazione commissiona diventano di sua titolarità e vanno
  rilasciate con la stessa licenza (Linee guida §3.9.2).

> **Da verificare:** se lo sviluppo fosse stato commissionato e pagato da un GAL o da un ente con
> un contratto, l'art. 69 c. 2 attribuisce i diritti all'amministrazione committente, salvo diverso
> accordo motivato. In quel caso il titolare andrebbe rivisto.

## 5. Cosa resta da completare

| File | Campo |
|------|-------|
| `README.md` | ente presso cui è in uso, manutentore, e-mail per le segnalazioni di sicurezza |
| `SECURITY.md` | e-mail per le segnalazioni di sicurezza |
| `publiccode.yml` | referente e e-mail in `maintenance.contacts` |
| `public/.well-known/security.txt` | `Contact` e `Canonical` |

```bash
git grep -n "DA INDICARE\|example.invalid"
```

## 6. Passi per il rilascio

1. Completare i campi sopra.
2. Rendere **pubblico** il repository GitHub (*Settings → General → Danger zone → Change
   visibility*). L'art. 69 c. 1 richiede un "repertorio pubblico".
3. Attivare le *Issues* su GitHub per le segnalazioni pubbliche (All. A §A.2).
4. Registrare il software su Developers Italia tramite il file `publiccode.yml` (All. A §A.11).
