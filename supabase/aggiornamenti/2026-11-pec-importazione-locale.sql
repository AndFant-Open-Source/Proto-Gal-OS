-- SPDX-License-Identifier: AGPL-3.0-or-later
-- SPDX-FileCopyrightText: 2026 Andrea Fantini
-- Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
-- ================================================================
-- PROTOGAL OS — Importazione PEC dal programma locale (senza Google)
--
-- Fino a oggi la coda PEC veniva riempita solo dalla Edge Function
-- "pec-importa", che legge il foglio Google e copia i file da Drive
-- usando la chiave di servizio: per questo sulle tabelle PEC non
-- esiste nessuna policy di INSERT.
--
-- Il programma di acquisizione sul PC dell'ufficio ora scrive
-- direttamente qui, leggendo le PEC da Thunderbird: Google esce
-- completamente dalla catena. Serve quindi che un utente vero
-- (admin o operatore attivo) possa inserire.
--
-- Questo aggiornamento è SOLO ADDITIVO: aggiunge policy nuove, con
-- nomi nuovi. Non tocca policy, tabelle, dati o funzioni esistenti,
-- e la Edge Function continua a funzionare come prima.
--
-- Cosa resta impedito anche dopo questo aggiornamento:
--  - inserire una PEC già protocollata o "pronta": lo stato iniziale
--    può essere solo "da_verificare" o "anomalia", così la verifica
--    dell'operatore in "Da protocollare" resta obbligatoria;
--  - assegnare numeri di protocollo (protocollo_id deve essere NULL);
--  - modificare mittente, date, impronte e anomalie di una PEC già
--    inserita: continua a impedirlo il trigger
--    protocollo_pec_messaggi_proteggi();
--  - sovrascrivere o cancellare i documenti già nell'archivio: sotto
--    pec/ si può solo aggiungere.
--
-- Eseguire nella SQL Editor del progetto. È idempotente.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Registro delle importazioni
--    Ogni esecuzione del programma locale apre una riga e la chiude
--    con il proprio esito: la pagina "Importazioni" le mostra tutte,
--    senza distinguere se sono arrivate da Drive o dal PC.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "pec_importazioni_inserimento_locale" ON protocollo_pec_importazioni;
CREATE POLICY "pec_importazioni_inserimento_locale" ON protocollo_pec_importazioni
  FOR INSERT TO authenticated
  WITH CHECK (protocollo_is_operatore() AND avviata_da = auth.uid());

-- Aggiornare solo la propria importazione (conteggi e stato finale)
DROP POLICY IF EXISTS "pec_importazioni_modifica_locale" ON protocollo_pec_importazioni;
CREATE POLICY "pec_importazioni_modifica_locale" ON protocollo_pec_importazioni
  FOR UPDATE TO authenticated
  USING (protocollo_is_operatore() AND avviata_da = auth.uid())
  WITH CHECK (protocollo_is_operatore() AND avviata_da = auth.uid());

-- ----------------------------------------------------------------
-- 2. Messaggi in coda
--    Lo stato iniziale ammesso è solo quello di una PEC ancora da
--    verificare: protocollare resta un atto separato, con i suoi
--    controlli (serie, date, anomalie).
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "pec_messaggi_inserimento_locale" ON protocollo_pec_messaggi;
CREATE POLICY "pec_messaggi_inserimento_locale" ON protocollo_pec_messaggi
  FOR INSERT TO authenticated
  WITH CHECK (
    protocollo_is_operatore()
    AND stato IN ('da_verificare', 'anomalia')
    AND protocollo_id IS NULL
  );

-- ----------------------------------------------------------------
-- 3. Documenti dei messaggi
--    Si possono registrare solo file di un messaggio esistente e non
--    ancora protocollato.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "pec_file_inserimento_locale" ON protocollo_pec_file;
CREATE POLICY "pec_file_inserimento_locale" ON protocollo_pec_file
  FOR INSERT TO authenticated
  WITH CHECK (
    protocollo_is_operatore()
    AND EXISTS (
      SELECT 1 FROM protocollo_pec_messaggi m
      WHERE m.id = messaggio_id AND m.stato <> 'protocollato'
    )
  );

-- ----------------------------------------------------------------
-- 4. Archivio dei documenti PEC
--    La policy esistente "protogal_allegati_caricamento" esclude la
--    cartella pec/ (la scriveva solo il server): si aggiunge una
--    policy a parte, senza modificare quella. Le policy sono
--    permissive, quindi basta che una delle due consenta.
--    Niente UPDATE: un documento acquisito non si sovrascrive.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "protogal_pec_caricamento_locale" ON storage.objects;
CREATE POLICY "protogal_pec_caricamento_locale" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'allegati-protocollo'
    AND name LIKE 'pec/%'
    AND public.protocollo_is_operatore()
  );
