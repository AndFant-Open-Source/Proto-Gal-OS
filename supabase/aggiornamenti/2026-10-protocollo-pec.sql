-- SPDX-License-Identifier: AGPL-3.0-or-later
-- SPDX-FileCopyrightText: 2026 Andrea Fantini
-- Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
--
-- Aggiornamento ottobre 2026: modulo Protocollo PEC e annullamento dei protocolli.
-- Da eseguire UNA volta nella SQL Editor dei progetti installati prima di questa versione,
-- DOPO 2026-10-fascicoli.sql. Le nuove installazioni non ne hanno bisogno.
--
-- Non modifica né cancella dati: i protocolli esistenti restano nella serie ordinaria con
-- gli stessi numeri (A/… U/…). La colonna calcolata numero_completo viene ricreata per
-- aggiungere la serie PEC (P-A/… P-U/…) e togliere il limite delle 4 cifre: i valori dei
-- protocolli esistenti restano identici.

-- Archivio: 50 MB per file e formati delle PEC
UPDATE storage.buckets
   SET file_size_limit = 52428800,
       allowed_mime_types = ARRAY[
         'application/pdf', 'application/pkcs7-mime', 'application/x-pkcs7-mime',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'image/jpeg', 'image/png', 'image/tiff',
         'message/rfc822', 'application/vnd.ms-outlook',
         'application/xml', 'text/xml', 'text/plain', 'text/csv', 'application/rtf',
         'application/zip', 'application/x-zip-compressed',
         'application/pkcs7-signature', 'application/x-pkcs7-signature',
         'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
         'image/gif', 'application/octet-stream'
       ]
 WHERE id = 'allegati-protocollo';

-- Registro: serie ordinaria / PEC
ALTER TABLE protocollo_registro
  ADD COLUMN IF NOT EXISTS registro text NOT NULL DEFAULT 'ordinario';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocollo_registro_registro_check') THEN
    ALTER TABLE protocollo_registro
      ADD CONSTRAINT protocollo_registro_registro_check CHECK (registro IN ('ordinario', 'pec'));
  END IF;
END $$;

-- Numero completo: prefisso P- per le PEC e nessun troncamento oltre 9999
DO $$
DECLARE
  v_espressione text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_espressione
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'protocollo_registro'::regclass AND a.attname = 'numero_completo';
  IF v_espressione IS NULL OR v_espressione NOT LIKE '%P-%' THEN
    ALTER TABLE protocollo_registro DROP COLUMN IF EXISTS numero_completo;
    ALTER TABLE protocollo_registro ADD COLUMN numero_completo text GENERATED ALWAYS AS (
      CASE registro WHEN 'pec' THEN 'P-' ELSE '' END ||
      CASE tipo_flusso WHEN 'arrivo' THEN 'A' ELSE 'U' END || '/' ||
      lpad(numero::text, greatest(4, length(numero::text)), '0') || '/' || anno::text
    ) STORED;
  END IF;

  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_espressione
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'protocollo_contratti'::regclass AND a.attname = 'numero_completo';
  IF v_espressione IS NULL OR v_espressione NOT LIKE '%greatest%' THEN
    ALTER TABLE protocollo_contratti DROP COLUMN IF EXISTS numero_completo;
    ALTER TABLE protocollo_contratti ADD COLUMN numero_completo text GENERATED ALWAYS AS (
      'C/' || lpad(numero::text, greatest(4, length(numero::text)), '0') || '/' || anno::text
    ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_registro_numero_completo ON protocollo_registro (numero_completo);
CREATE INDEX IF NOT EXISTS idx_registro_registro ON protocollo_registro (registro, anno, tipo_flusso);

-- Stato "annullato"
ALTER TABLE protocollo_registro DROP CONSTRAINT IF EXISTS protocollo_registro_stato_check;
ALTER TABLE protocollo_registro ADD CONSTRAINT protocollo_registro_stato_check
  CHECK (stato IN ('ricevuto', 'in_lavorazione', 'evaso', 'archiviato', 'annullato'));

-- Numero unico per serie
ALTER TABLE protocollo_registro DROP CONSTRAINT IF EXISTS protocollo_registro_anno_tipo_numero_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocollo_registro_serie_numero_key') THEN
    ALTER TABLE protocollo_registro
      ADD CONSTRAINT protocollo_registro_serie_numero_key UNIQUE (registro, anno, tipo_flusso, numero);
  END IF;
END $$;

-- Contatori per serie
ALTER TABLE protocollo_sequenze
  ADD COLUMN IF NOT EXISTS registro text NOT NULL DEFAULT 'ordinario';
ALTER TABLE protocollo_sequenze DROP CONSTRAINT IF EXISTS protocollo_sequenze_anno_tipo_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocollo_sequenze_registro_check') THEN
    ALTER TABLE protocollo_sequenze
      ADD CONSTRAINT protocollo_sequenze_registro_check CHECK (registro IN ('ordinario', 'pec'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocollo_sequenze_serie_key') THEN
    ALTER TABLE protocollo_sequenze
      ADD CONSTRAINT protocollo_sequenze_serie_key UNIQUE (registro, anno, tipo_flusso);
  END IF;
END $$;

-- Allegati: dati dell'importazione PEC
ALTER TABLE protocollo_allegati ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE protocollo_allegati ADD COLUMN IF NOT EXISTS origine text;
ALTER TABLE protocollo_allegati ADD COLUMN IF NOT EXISTS posizione integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocollo_allegati_origine_check') THEN
    ALTER TABLE protocollo_allegati
      ADD CONSTRAINT protocollo_allegati_origine_check CHECK (origine IN ('pdf_pec', 'allegato', 'eml'));
  END IF;
END $$;

-- Funzioni aggiornate: contatori per serie, protezione del registro, rinumerazione
-- della sola serie ordinaria, importazione dei backup
DROP FUNCTION IF EXISTS protocollo_incrementa(integer, text);
CREATE OR REPLACE FUNCTION protocollo_incrementa(p_anno integer, p_tipo_flusso text, p_registro text DEFAULT 'ordinario')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  INSERT INTO protocollo_sequenze (registro, anno, tipo_flusso, ultimo_numero)
    VALUES (p_registro, p_anno, p_tipo_flusso, 1)
    ON CONFLICT (registro, anno, tipo_flusso) DO UPDATE
      SET ultimo_numero = protocollo_sequenze.ultimo_numero + 1,
          updated_at    = now()
  RETURNING ultimo_numero INTO v_numero;
  RETURN v_numero;
END;
$$;
REVOKE ALL ON FUNCTION protocollo_incrementa(integer, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION protocollo_proteggi_campi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SQL Editor / service role (manutenzione), importazione di un backup (solo admin) e
  -- protocollazione PEC (protocollo_pec_protocolla): numeri e date li fissa la funzione chiamante
  IF auth.uid() IS NULL OR protocollo_importazione_in_corso() OR protocollo_pec_in_corso() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.registro := 'ordinario';
    NEW.stato := CASE WHEN NEW.stato = 'annullato' THEN 'ricevuto' ELSE NEW.stato END;
    NEW.data_registrazione := now();
    NEW.operatore_id := auth.uid();
    NEW.anno := extract(year FROM now() AT TIME ZONE 'Europe/Rome')::int;
    NEW.numero := protocollo_incrementa(NEW.anno, NEW.tipo_flusso);
    IF NEW.bloccato THEN
      NEW.bloccato_da := auth.uid();
      NEW.bloccato_il := now();
    ELSE
      NEW.bloccato_da := NULL;
      NEW.bloccato_il := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.registro := OLD.registro;

  IF OLD.stato = 'annullato' THEN
    RAISE EXCEPTION 'Protocollo % annullato: non può essere modificato', OLD.numero_completo USING ERRCODE = '42501';
  END IF;
  IF NEW.stato = 'annullato' AND coalesce(current_setting('protogal.annullamento', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Per annullare un protocollo usare la funzione "Annulla protocollo"' USING ERRCODE = '42501';
  END IF;
  IF OLD.registro = 'pec' AND NOT NEW.bloccato THEN
    RAISE EXCEPTION 'I protocolli PEC restano sempre bloccati' USING ERRCODE = '42501';
  END IF;

  -- Blocco / sblocco
  IF NEW.bloccato IS DISTINCT FROM OLD.bloccato THEN
    IF NEW.bloccato THEN
      NEW.bloccato_da := auth.uid();
      NEW.bloccato_il := now();
    ELSE
      IF NOT protocollo_is_admin() THEN
        RAISE EXCEPTION 'Solo un amministratore può sbloccare un protocollo' USING ERRCODE = '42501';
      END IF;
      NEW.bloccato_da := NULL;
      NEW.bloccato_il := NULL;
    END IF;
  ELSE
    NEW.bloccato_da := OLD.bloccato_da;
    NEW.bloccato_il := OLD.bloccato_il;
  END IF;

  IF OLD.bloccato AND NEW.bloccato AND (
       NEW.numero             IS DISTINCT FROM OLD.numero
    OR NEW.anno               IS DISTINCT FROM OLD.anno
    OR NEW.tipo_flusso        IS DISTINCT FROM OLD.tipo_flusso
    OR NEW.data_registrazione IS DISTINCT FROM OLD.data_registrazione
  ) THEN
    RAISE EXCEPTION 'Protocollo % bloccato: numero, tipo e data non possono essere modificati', OLD.numero_completo
      USING ERRCODE = '42501';
  END IF;

  IF NOT protocollo_is_admin() AND (
       NEW.numero             IS DISTINCT FROM OLD.numero
    OR NEW.anno               IS DISTINCT FROM OLD.anno
    OR NEW.data_registrazione IS DISTINCT FROM OLD.data_registrazione
    OR NEW.operatore_id       IS DISTINCT FROM OLD.operatore_id
  ) THEN
    RAISE EXCEPTION 'Solo un amministratore può modificare numero, anno o data di protocollazione'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.tipo_flusso IS DISTINCT FROM OLD.tipo_flusso AND NEW.numero = OLD.numero THEN
    NEW.numero := protocollo_incrementa(NEW.anno, NEW.tipo_flusso, NEW.registro);
  END IF;

  IF (NEW.data_registrazione IS DISTINCT FROM OLD.data_registrazione OR NEW.anno IS DISTINCT FROM OLD.anno)
     AND extract(year FROM NEW.data_registrazione AT TIME ZONE 'Europe/Rome')::int <> NEW.anno THEN
    RAISE EXCEPTION 'La data di protocollazione deve appartenere all''anno %', NEW.anno USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protocollo_blocca_eliminazione()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.bloccato AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Protocollo % bloccato o annullato: non può essere eliminato', OLD.numero_completo
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION protocollo_rinumera(p_anno integer, p_tipo_flusso text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefisso  text;
  v_sbloccati integer;
  v_bloccati  integer;
  v_massimo   integer;
BEGIN
  IF NOT protocollo_is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori' USING ERRCODE = '42501';
  END IF;
  IF p_tipo_flusso NOT IN ('arrivo', 'partenza') THEN
    RAISE EXCEPTION 'Tipo flusso non valido' USING ERRCODE = '22023';
  END IF;
  v_prefisso := CASE p_tipo_flusso WHEN 'arrivo' THEN 'A' ELSE 'U' END;

  -- Blocca il contatore: le nuove registrazioni attendono la fine
  PERFORM 1 FROM protocollo_sequenze
    WHERE registro = 'ordinario' AND anno = p_anno AND tipo_flusso = p_tipo_flusso FOR UPDATE;

  SELECT count(*) FILTER (WHERE NOT bloccato), count(*) FILTER (WHERE bloccato)
    INTO v_sbloccati, v_bloccati
    FROM protocollo_registro WHERE registro = 'ordinario' AND anno = p_anno AND tipo_flusso = p_tipo_flusso;

  CREATE TEMP TABLE IF NOT EXISTS _rinumera (id uuid, numero integer, numero_completo text, nuovo integer) ON COMMIT DROP;
  DELETE FROM _rinumera;
  INSERT INTO _rinumera
  SELECT o.id, o.numero, o.numero_completo, l.n
  FROM (
    SELECT id, numero, numero_completo,
           row_number() OVER (ORDER BY data_registrazione, created_at, id) AS rn
    FROM protocollo_registro
    WHERE registro = 'ordinario' AND anno = p_anno AND tipo_flusso = p_tipo_flusso AND NOT bloccato
  ) o
  JOIN (
    SELECT n, row_number() OVER (ORDER BY n) AS rn
    FROM generate_series(1, greatest(v_sbloccati + v_bloccati, 1)) AS n
    WHERE n NOT IN (SELECT numero FROM protocollo_registro
                    WHERE registro = 'ordinario' AND anno = p_anno AND tipo_flusso = p_tipo_flusso AND bloccato)
  ) l ON l.rn = o.rn;

  INSERT INTO protocollo_log_azioni (protocollo_id, utente_id, azione, dettaglio)
  SELECT id, auth.uid(), 'RINUMERAZIONE',
         jsonb_build_object('vecchio_numero', numero_completo,
                            'nuovo_numero', v_prefisso || '/' || lpad(nuovo::text, greatest(4, length(nuovo::text)), '0') || '/' || p_anno)
  FROM _rinumera WHERE numero <> nuovo;

  UPDATE protocollo_registro SET numero = numero + 1000000
    WHERE registro = 'ordinario' AND anno = p_anno AND tipo_flusso = p_tipo_flusso AND NOT bloccato;
  UPDATE protocollo_registro r SET numero = t.nuovo FROM _rinumera t WHERE r.id = t.id;

  SELECT coalesce(max(numero), 0) INTO v_massimo
    FROM protocollo_registro WHERE registro = 'ordinario' AND anno = p_anno AND tipo_flusso = p_tipo_flusso;
  INSERT INTO protocollo_sequenze (registro, anno, tipo_flusso, ultimo_numero)
    VALUES ('ordinario', p_anno, p_tipo_flusso, v_massimo)
    ON CONFLICT (registro, anno, tipo_flusso) DO UPDATE
      SET ultimo_numero = EXCLUDED.ultimo_numero, updated_at = now();

  RETURN v_sbloccati;
END;
$$;

CREATE OR REPLACE FUNCTION protocollo_importa_backup(p_tabella text, p_righe jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totale integer := 0;
BEGIN
  IF NOT protocollo_is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('protogal.importazione', 'on', true);

  IF p_tabella = 'protocolli' THEN
    INSERT INTO protocollo_registro (
      id, registro, numero, anno, tipo_flusso, data_registrazione, data_documento, canale, oggetto,
      mittente_nome, mittente_email, mittente_pec, destinatario_nome, destinatario_email, destinatario_pec,
      ufficio_assegnatario, operatore_id, stato, note, protocollo_collegato,
      bloccato, bloccato_da, bloccato_il, created_at, updated_at)
    SELECT r.id, coalesce(r.registro, 'ordinario'), r.numero, r.anno, r.tipo_flusso,
      coalesce(r.data_registrazione, r.created_at, now()),
      r.data_documento, r.canale, r.oggetto,
      r.mittente_nome, r.mittente_email, r.mittente_pec, r.destinatario_nome, r.destinatario_email, r.destinatario_pec,
      r.ufficio_assegnatario, (SELECT u.id FROM auth.users u WHERE u.id = r.operatore_id),
      coalesce(r.stato, 'ricevuto'), r.note, r.protocollo_collegato,
      coalesce(r.bloccato, false), (SELECT u.id FROM auth.users u WHERE u.id = r.bloccato_da), r.bloccato_il,
      coalesce(r.created_at, now()), coalesce(r.updated_at, r.created_at, now())
    FROM jsonb_populate_recordset(NULL::protocollo_registro, p_righe) r
    ON CONFLICT (id) DO NOTHING;

  ELSIF p_tabella = 'allegati_protocolli' THEN
    INSERT INTO protocollo_allegati (
      id, protocollo_id, nome_file, storage_path, dimensione_bytes, tipo_mime, caricato_da, created_at, updated_at)
    SELECT r.id, r.protocollo_id, r.nome_file, r.storage_path, r.dimensione_bytes, r.tipo_mime,
      (SELECT u.id FROM auth.users u WHERE u.id = r.caricato_da),
      coalesce(r.created_at, now()), coalesce(r.updated_at, r.created_at, now())
    FROM jsonb_populate_recordset(NULL::protocollo_allegati, p_righe) r
    WHERE EXISTS (SELECT 1 FROM protocollo_registro p WHERE p.id = r.protocollo_id)
    ON CONFLICT (id) DO NOTHING;

  ELSIF p_tabella = 'contratti' THEN
    INSERT INTO protocollo_contratti (
      id, numero, anno, data_repertorio, data_stipula, tipo_contratto, forma_stipula, oggetto,
      contraente_nome, contraente_codice_fiscale, contraente_pec, importo, cig, cup, data_inizio, data_fine,
      stato, protocollo_collegato, note, operatore_id, created_at, updated_at)
    SELECT r.id, r.numero, r.anno, coalesce(r.data_repertorio, r.created_at, now()), r.data_stipula,
      coalesce(r.tipo_contratto, 'servizi'), r.forma_stipula, r.oggetto,
      r.contraente_nome, r.contraente_codice_fiscale, r.contraente_pec, r.importo, r.cig, r.cup,
      r.data_inizio, r.data_fine, coalesce(r.stato, 'in_corso'), r.protocollo_collegato, r.note,
      (SELECT u.id FROM auth.users u WHERE u.id = r.operatore_id),
      coalesce(r.created_at, now()), coalesce(r.updated_at, r.created_at, now())
    FROM jsonb_populate_recordset(NULL::protocollo_contratti, p_righe) r
    ON CONFLICT (id) DO NOTHING;

  ELSIF p_tabella = 'allegati_contratti' THEN
    INSERT INTO protocollo_contratti_allegati (
      id, contratto_id, nome_file, storage_path, dimensione_bytes, tipo_mime, caricato_da, created_at, updated_at)
    SELECT r.id, r.contratto_id, r.nome_file, r.storage_path, r.dimensione_bytes, r.tipo_mime,
      (SELECT u.id FROM auth.users u WHERE u.id = r.caricato_da),
      coalesce(r.created_at, now()), coalesce(r.updated_at, r.created_at, now())
    FROM jsonb_populate_recordset(NULL::protocollo_contratti_allegati, p_righe) r
    WHERE EXISTS (SELECT 1 FROM protocollo_contratti c WHERE c.id = r.contratto_id)
    ON CONFLICT (id) DO NOTHING;

  ELSIF p_tabella = 'storico' THEN
    INSERT INTO protocollo_log_azioni (
      id, protocollo_id, contratto_id, utente_id, azione, dettaglio, numero_completo_rif, created_at)
    SELECT r.id,
      (SELECT p.id FROM protocollo_registro p WHERE p.id = r.protocollo_id),
      (SELECT c.id FROM protocollo_contratti c WHERE c.id = r.contratto_id),
      (SELECT pr.id FROM protocollo_profili pr WHERE pr.id = r.utente_id),
      r.azione, r.dettaglio, r.numero_completo_rif, coalesce(r.created_at, now())
    FROM jsonb_populate_recordset(NULL::protocollo_log_azioni, p_righe) r
    ON CONFLICT (id) DO NOTHING;

  ELSIF p_tabella = 'contatori' THEN
    -- Contatori del backup e numeri effettivamente presenti: vale il più alto
    INSERT INTO protocollo_sequenze (registro, anno, tipo_flusso, ultimo_numero)
    SELECT registro, anno, tipo_flusso, max(n) FROM (
      SELECT coalesce(r.registro, 'ordinario') AS registro, r.anno, r.tipo_flusso, r.ultimo_numero AS n
        FROM jsonb_to_recordset(p_righe -> 'protocolli')
          AS r(registro text, anno integer, tipo_flusso text, ultimo_numero integer)
      UNION ALL
      SELECT registro, anno, tipo_flusso, numero FROM protocollo_registro
    ) t
    WHERE tipo_flusso IN ('arrivo', 'partenza') AND registro IN ('ordinario', 'pec')
    GROUP BY registro, anno, tipo_flusso
    ON CONFLICT (registro, anno, tipo_flusso) DO UPDATE
      SET ultimo_numero = greatest(protocollo_sequenze.ultimo_numero, EXCLUDED.ultimo_numero),
          updated_at = now();

    INSERT INTO protocollo_contratti_sequenze (anno, ultimo_numero)
    SELECT anno, max(n) FROM (
      SELECT r.anno, r.ultimo_numero AS n
        FROM jsonb_to_recordset(p_righe -> 'contratti') AS r(anno integer, ultimo_numero integer)
      UNION ALL
      SELECT anno, numero FROM protocollo_contratti
    ) t
    GROUP BY anno
    ON CONFLICT (anno) DO UPDATE
      SET ultimo_numero = greatest(protocollo_contratti_sequenze.ultimo_numero, EXCLUDED.ultimo_numero),
          updated_at = now();

  ELSE
    RAISE EXCEPTION 'Tabella di importazione non valida: %', p_tabella USING ERRCODE = '22023';
  END IF;

  GET DIAGNOSTICS v_totale = ROW_COUNT;
  RETURN v_totale;
END;
$$;

-- Regole di accesso: allegati e archivio dei protocolli PEC
DROP POLICY IF EXISTS "allegati_inserimento"  ON protocollo_allegati;
DROP POLICY IF EXISTS "allegati_eliminazione" ON protocollo_allegati;
CREATE POLICY "allegati_inserimento"  ON protocollo_allegati FOR INSERT WITH CHECK (
  protocollo_is_operatore()
  AND NOT EXISTS (SELECT 1 FROM protocollo_registro r WHERE r.id = protocollo_id AND r.registro = 'pec'));
CREATE POLICY "allegati_eliminazione" ON protocollo_allegati FOR DELETE USING (
  protocollo_is_operatore()
  AND NOT EXISTS (SELECT 1 FROM protocollo_registro r WHERE r.id = protocollo_id AND r.registro = 'pec'));

DROP POLICY IF EXISTS "protogal_allegati_caricamento"  ON storage.objects;
DROP POLICY IF EXISTS "protogal_allegati_eliminazione" ON storage.objects;
CREATE POLICY "protogal_allegati_caricamento" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'allegati-protocollo' AND public.protocollo_is_operatore() AND name NOT LIKE 'pec/%');
CREATE POLICY "protogal_allegati_eliminazione" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'allegati-protocollo' AND public.protocollo_is_operatore() AND name NOT LIKE 'pec/%');

-- ----------------------------------------------------------------
-- 10. Protocollo PEC (P-A/0001/2026, P-U/0001/2026)
--     Le PEC arrivano dall'importazione da Google Drive (Edge Function pec-importa,
--     lato server) in una coda; un operatore le verifica e le protocolla. La data di
--     protocollo è la data della PEC: certificata (daticert.xml) se presente,
--     altrimenti quella dell'email. Data e autore reali della protocollazione restano
--     nello storico e in created_at.
-- ----------------------------------------------------------------

-- Vero solo dentro protocollo_pec_protocolla (impostazione valida per la sola transazione)
-- e solo per un operatore: i client non possono impostarla da soli
CREATE OR REPLACE FUNCTION protocollo_pec_in_corso()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(current_setting('protogal.pec', true), '') = 'on' AND protocollo_is_operatore();
$$;

-- "Mario Rossi <m.rossi@pec.it>, Ufficio <u@pec.it>" → nome del primo e tutti gli indirizzi
CREATE OR REPLACE FUNCTION protocollo_pec_nome(p_testo text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT nullif(trim(both ' "''' FROM split_part(split_part(coalesce(p_testo, ''), ',', 1), '<', 1)), '');
$$;

CREATE OR REPLACE FUNCTION protocollo_pec_indirizzi(p_testo text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT nullif(string_agg(DISTINCT lower(x[1]), ', '), '')
  FROM regexp_matches(coalesce(p_testo, ''), '([A-Za-z0-9._%+''-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') AS x;
$$;

CREATE TABLE IF NOT EXISTS protocollo_pec_importazioni (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avviata_da    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  avviata_il    timestamptz NOT NULL DEFAULT now(),
  conclusa_il   timestamptz,
  stato         text NOT NULL DEFAULT 'in_corso' CHECK (stato IN ('in_corso', 'completata', 'interrotta')),
  righe_indice  integer NOT NULL DEFAULT 0,
  nuove         integer NOT NULL DEFAULT 0,
  gia_presenti  integer NOT NULL DEFAULT 0,
  anomalie      integer NOT NULL DEFAULT 0,
  -- Messaggio sintetico, senza contenuti delle PEC né credenziali
  errore        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_pec_importazioni_updated_at ON protocollo_pec_importazioni;
CREATE TRIGGER trg_pec_importazioni_updated_at
  BEFORE UPDATE ON protocollo_pec_importazioni
  FOR EACH ROW EXECUTE FUNCTION aggiorna_updated_at();

-- Coda: un messaggio (o una ricevuta) per riga dell'indice
CREATE TABLE IF NOT EXISTS protocollo_pec_messaggi (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_acquisizione        text NOT NULL UNIQUE,
  -- ricevuta = accettazione, consegna, mancata consegna…: mai protocollata, agganciata al messaggio
  tipo                   text NOT NULL DEFAULT 'messaggio' CHECK (tipo IN ('messaggio', 'ricevuta')),
  direzione              text CHECK (direzione IN ('arrivo', 'partenza')),
  direzione_proposta     text,
  mittente               text,
  destinatari            text,
  cc                     text,
  oggetto                text,
  corpo_anteprima        text,
  -- Message-ID senza parentesi angolari e in minuscolo
  message_id             text,
  sha256_eml             text,
  data_email             timestamptz,
  data_certificata       timestamptz,
  data_pec               timestamptz GENERATED ALWAYS AS (coalesce(data_certificata, data_email)) STORED,
  -- Dal certificato: posta-certificata, accettazione, avvenuta-consegna, errore-consegna…
  tipo_certificazione    text,
  riferimento_message_id text,
  ricevuta_di            uuid REFERENCES protocollo_pec_messaggi(id) ON DELETE SET NULL,
  stato                  text NOT NULL DEFAULT 'da_verificare'
                         CHECK (stato IN ('da_verificare', 'pronto', 'anomalia', 'protocollato', 'scartato')),
  -- anomalie: impediscono la protocollazione · avvisi: da guardare, non bloccano
  anomalie               text[] NOT NULL DEFAULT '{}',
  avvisi                 text[] NOT NULL DEFAULT '{}',
  note_verifica          text,
  drive_cartella         text,
  numero_allegati_indice integer,
  protocollo_id          uuid UNIQUE REFERENCES protocollo_registro(id) ON DELETE RESTRICT,
  importazione_id        uuid REFERENCES protocollo_pec_importazioni(id) ON DELETE SET NULL,
  importato_il           timestamptz NOT NULL DEFAULT now(),
  verificato_da          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verificato_il          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protocollo_pec_messaggi_protocollato_check CHECK ((stato = 'protocollato') = (protocollo_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_pec_messaggi_stato      ON protocollo_pec_messaggi (stato, data_pec);
CREATE INDEX IF NOT EXISTS idx_pec_messaggi_message_id ON protocollo_pec_messaggi (message_id);
CREATE INDEX IF NOT EXISTS idx_pec_messaggi_sha256     ON protocollo_pec_messaggi (sha256_eml);
CREATE INDEX IF NOT EXISTS idx_pec_messaggi_ricevuta   ON protocollo_pec_messaggi (ricevuta_di);

DROP TRIGGER IF EXISTS trg_pec_messaggi_updated_at ON protocollo_pec_messaggi;
CREATE TRIGGER trg_pec_messaggi_updated_at
  BEFORE UPDATE ON protocollo_pec_messaggi
  FOR EACH ROW EXECUTE FUNCTION aggiorna_updated_at();

-- File copiati da Drive (cartella pec/<id acquisizione>/ dell'archivio)
CREATE TABLE IF NOT EXISTS protocollo_pec_file (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  messaggio_id     uuid NOT NULL REFERENCES protocollo_pec_messaggi(id) ON DELETE CASCADE,
  -- pdf = PDF di consultazione (dal programma Windows o creato dall'importazione se manca)
  ruolo            text NOT NULL CHECK (ruolo IN ('eml', 'pdf', 'allegato')),
  posizione        integer NOT NULL DEFAULT 0,
  nome_file        text NOT NULL,
  storage_path     text NOT NULL UNIQUE,
  dimensione_bytes bigint,
  tipo_mime        text,
  sha256           text,
  generato         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pec_file_messaggio ON protocollo_pec_file (messaggio_id);

-- Correzioni dell'operatore: solo direzione, oggetto, stato di verifica e note.
-- I dati arrivati da Drive (mittente, date, impronte, anomalie) non si modificano.
CREATE OR REPLACE FUNCTION protocollo_pec_messaggi_proteggi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR protocollo_pec_in_corso() THEN
    RETURN NEW;
  END IF;
  IF OLD.stato = 'protocollato' THEN
    RAISE EXCEPTION 'PEC già protocollata: non modificabile' USING ERRCODE = '42501';
  END IF;

  NEW.id_acquisizione := OLD.id_acquisizione;
  NEW.tipo := OLD.tipo;
  NEW.mittente := OLD.mittente;
  NEW.destinatari := OLD.destinatari;
  NEW.cc := OLD.cc;
  NEW.corpo_anteprima := OLD.corpo_anteprima;
  NEW.message_id := OLD.message_id;
  NEW.sha256_eml := OLD.sha256_eml;
  NEW.data_email := OLD.data_email;
  NEW.data_certificata := OLD.data_certificata;
  NEW.tipo_certificazione := OLD.tipo_certificazione;
  NEW.riferimento_message_id := OLD.riferimento_message_id;
  NEW.anomalie := OLD.anomalie;
  NEW.avvisi := OLD.avvisi;
  NEW.drive_cartella := OLD.drive_cartella;
  NEW.numero_allegati_indice := OLD.numero_allegati_indice;
  NEW.protocollo_id := OLD.protocollo_id;
  NEW.importazione_id := OLD.importazione_id;
  NEW.importato_il := OLD.importato_il;
  NEW.created_at := OLD.created_at;

  IF NEW.stato = 'protocollato' THEN
    RAISE EXCEPTION 'Per protocollare usare "Protocolla selezionate"' USING ERRCODE = '42501';
  END IF;
  IF NEW.stato = 'anomalia' AND cardinality(NEW.anomalie) = 0 THEN
    NEW.stato := 'da_verificare';
  END IF;
  IF NEW.stato = 'pronto' AND OLD.stato <> 'pronto' THEN
    IF NEW.tipo <> 'messaggio' THEN
      RAISE EXCEPTION 'Le ricevute non si protocollano' USING ERRCODE = '22023';
    END IF;
    IF cardinality(NEW.anomalie) > 0 THEN
      RAISE EXCEPTION 'La PEC ha anomalie da risolvere: non può essere protocollata' USING ERRCODE = '22023';
    END IF;
    IF NEW.direzione IS NULL THEN
      RAISE EXCEPTION 'Indicare se la PEC è in entrata o in uscita' USING ERRCODE = '22023';
    END IF;
    IF coalesce(NEW.data_certificata, NEW.data_email) IS NULL THEN
      RAISE EXCEPTION 'La PEC non ha una data: non può essere protocollata' USING ERRCODE = '22023';
    END IF;
    NEW.verificato_da := auth.uid();
    NEW.verificato_il := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pec_messaggi_proteggi ON protocollo_pec_messaggi;
CREATE TRIGGER trg_pec_messaggi_proteggi
  BEFORE UPDATE ON protocollo_pec_messaggi
  FOR EACH ROW EXECUTE FUNCTION protocollo_pec_messaggi_proteggi();

-- Protocollazione delle PEC "pronte", in ordine di data della PEC, in un'unica transazione:
-- se una non può essere protocollata non viene assegnato nessun numero.
CREATE OR REPLACE FUNCTION protocollo_pec_protocolla(
  p_messaggi        uuid[],
  p_fascicolo_id    uuid DEFAULT NULL,
  p_conferma_ritardo boolean DEFAULT false
)
RETURNS TABLE (messaggio_id uuid, protocollo_id uuid, numero_completo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  m        protocollo_pec_messaggi;
  v_anno   integer;
  v_numero integer;
  v_prot   uuid;
  v_num    text;
  v_ultima timestamptz;
  v_trovati integer := 0;
BEGIN
  IF NOT protocollo_is_operatore() THEN
    RAISE EXCEPTION 'Operazione riservata a operatori e amministratori' USING ERRCODE = '42501';
  END IF;
  IF p_fascicolo_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM protocollo_fascicoli f WHERE f.id = p_fascicolo_id AND f.stato = 'aperto') THEN
    RAISE EXCEPTION 'Il fascicolo scelto non esiste o è chiuso' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('protogal.pec', 'on', true);

  FOR m IN
    SELECT * FROM protocollo_pec_messaggi
    WHERE id = ANY (p_messaggi)
    ORDER BY data_pec, id
    FOR UPDATE
  LOOP
    v_trovati := v_trovati + 1;
    IF m.stato <> 'pronto' OR m.tipo <> 'messaggio' THEN
      RAISE EXCEPTION 'La PEC % non è pronta per la protocollazione', m.id_acquisizione USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM protocollo_pec_file f WHERE f.messaggio_id = m.id AND f.ruolo = 'pdf') THEN
      RAISE EXCEPTION 'La PEC % non ha il PDF di consultazione', m.id_acquisizione USING ERRCODE = '22023';
    END IF;

    v_anno := extract(year FROM m.data_pec AT TIME ZONE 'Europe/Rome')::int;

    -- Una PEC più vecchia dell'ultima già protocollata nella serie prende comunque il numero
    -- successivo: serve la conferma esplicita
    SELECT max(r.data_registrazione) INTO v_ultima
      FROM protocollo_registro r
      WHERE r.registro = 'pec' AND r.anno = v_anno AND r.tipo_flusso = m.direzione;
    IF v_ultima > m.data_pec AND NOT p_conferma_ritardo THEN
      RAISE EXCEPTION 'PEC_IN_RITARDO:%', m.id_acquisizione USING ERRCODE = 'P0001';
    END IF;

    v_numero := protocollo_incrementa(v_anno, m.direzione, 'pec');

    INSERT INTO protocollo_registro (
      registro, numero, anno, tipo_flusso, data_registrazione, canale, oggetto,
      mittente_nome, mittente_pec, destinatario_nome, destinatario_pec,
      operatore_id, stato, bloccato, bloccato_da, bloccato_il)
    VALUES (
      'pec', v_numero, v_anno, m.direzione, m.data_pec, 'pec',
      coalesce(nullif(trim(m.oggetto), ''), '(senza oggetto)'),
      coalesce(protocollo_pec_nome(m.mittente), protocollo_pec_indirizzi(m.mittente)),
      protocollo_pec_indirizzi(m.mittente),
      coalesce(protocollo_pec_nome(m.destinatari), protocollo_pec_indirizzi(m.destinatari)),
      protocollo_pec_indirizzi(m.destinatari),
      auth.uid(), CASE m.direzione WHEN 'partenza' THEN 'evaso' ELSE 'ricevuto' END,
      true, auth.uid(), now())
    RETURNING id, numero_completo INTO v_prot, v_num;

    -- Documento principale (PDF), allegati nell'ordine originale, EML originale per ultimo
    INSERT INTO protocollo_allegati (
      protocollo_id, nome_file, storage_path, dimensione_bytes, tipo_mime, caricato_da, sha256, origine, posizione)
    SELECT v_prot, f.nome_file, f.storage_path, f.dimensione_bytes, f.tipo_mime, auth.uid(), f.sha256,
           CASE f.ruolo WHEN 'pdf' THEN 'pdf_pec' WHEN 'eml' THEN 'eml' ELSE 'allegato' END,
           CASE f.ruolo WHEN 'pdf' THEN 0 WHEN 'eml' THEN 1000000 ELSE f.posizione END
    FROM protocollo_pec_file f
    WHERE f.messaggio_id = m.id;

    UPDATE protocollo_pec_messaggi SET stato = 'protocollato', protocollo_id = v_prot WHERE id = m.id;

    IF p_fascicolo_id IS NOT NULL THEN
      INSERT INTO protocollo_fascicoli_documenti (fascicolo_id, protocollo_id) VALUES (p_fascicolo_id, v_prot);
    END IF;

    INSERT INTO protocollo_log_azioni (protocollo_id, utente_id, azione, dettaglio)
    VALUES (v_prot, auth.uid(), 'PROTOCOLLAZIONE_PEC', jsonb_build_object(
      'id_acquisizione', m.id_acquisizione,
      'data_pec', to_char(m.data_pec AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY HH24:MI:SS'),
      'origine_data', CASE WHEN m.data_certificata IS NOT NULL THEN 'certificata' ELSE 'email (non certificata)' END,
      'importata_il', to_char(m.importato_il AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY HH24:MI')));

    messaggio_id := m.id;
    protocollo_id := v_prot;
    numero_completo := v_num;
    RETURN NEXT;
  END LOOP;

  IF v_trovati <> coalesce(cardinality(p_messaggi), 0) THEN
    RAISE EXCEPTION 'Alcune PEC selezionate non esistono più: aggiornare la pagina' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION protocollo_pec_protocolla(uuid[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION protocollo_pec_protocolla(uuid[], uuid, boolean) TO authenticated;

-- Ricevute agganciate al messaggio inviato a cui si riferiscono (chiamata dall'importazione)
CREATE OR REPLACE FUNCTION protocollo_pec_collega_ricevute()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totale integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT protocollo_is_operatore() THEN
    RAISE EXCEPTION 'Operazione riservata a operatori e amministratori' USING ERRCODE = '42501';
  END IF;
  UPDATE protocollo_pec_messaggi r
     SET ricevuta_di = m.id
    FROM protocollo_pec_messaggi m
   WHERE r.tipo = 'ricevuta' AND r.ricevuta_di IS NULL AND r.riferimento_message_id IS NOT NULL
     AND m.tipo = 'messaggio' AND m.message_id = r.riferimento_message_id;
  GET DIAGNOSTICS v_totale = ROW_COUNT;
  RETURN v_totale;
END;
$$;
REVOKE ALL ON FUNCTION protocollo_pec_collega_ricevute() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION protocollo_pec_collega_ricevute() TO authenticated;

-- Annullamento (solo admin, motivo obbligatorio): il numero resta occupato, il protocollo
-- viene bloccato e non è più modificabile né eliminabile
CREATE OR REPLACE FUNCTION protocollo_annulla(p_protocollo_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT protocollo_is_admin() THEN
    RAISE EXCEPTION 'Solo un amministratore può annullare un protocollo' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 5 THEN
    RAISE EXCEPTION 'Indicare il motivo dell''annullamento (almeno 5 caratteri)' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('protogal.annullamento', 'on', true);
  UPDATE protocollo_registro SET stato = 'annullato', bloccato = true
   WHERE id = p_protocollo_id AND stato <> 'annullato';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocollo inesistente o già annullato' USING ERRCODE = '22023';
  END IF;
  INSERT INTO protocollo_log_azioni (protocollo_id, utente_id, azione, dettaglio)
  VALUES (p_protocollo_id, auth.uid(), 'ANNULLAMENTO', jsonb_build_object('motivo', trim(p_motivo)));
  PERFORM set_config('protogal.annullamento', '', true);
END;
$$;
REVOKE ALL ON FUNCTION protocollo_annulla(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION protocollo_annulla(uuid, text) TO authenticated;

-- Accessi: tutti i profili attivi leggono; gli operatori correggono la coda;
-- importazione e file solo lato server; un admin può togliere dalla coda una PEC non
-- protocollata (per reimportarla).
ALTER TABLE protocollo_pec_importazioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_pec_messaggi     ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocollo_pec_file         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pec_importazioni_lettura" ON protocollo_pec_importazioni;
CREATE POLICY "pec_importazioni_lettura" ON protocollo_pec_importazioni
  FOR SELECT USING (protocollo_utente_attivo());

DROP POLICY IF EXISTS "pec_messaggi_lettura"      ON protocollo_pec_messaggi;
DROP POLICY IF EXISTS "pec_messaggi_modifica"     ON protocollo_pec_messaggi;
DROP POLICY IF EXISTS "pec_messaggi_eliminazione" ON protocollo_pec_messaggi;
CREATE POLICY "pec_messaggi_lettura"  ON protocollo_pec_messaggi FOR SELECT USING (protocollo_utente_attivo());
CREATE POLICY "pec_messaggi_modifica" ON protocollo_pec_messaggi FOR UPDATE
  USING (protocollo_is_operatore()) WITH CHECK (protocollo_is_operatore());
CREATE POLICY "pec_messaggi_eliminazione" ON protocollo_pec_messaggi FOR DELETE
  USING (protocollo_is_admin() AND stato <> 'protocollato');

DROP POLICY IF EXISTS "pec_file_lettura" ON protocollo_pec_file;
CREATE POLICY "pec_file_lettura" ON protocollo_pec_file FOR SELECT USING (protocollo_utente_attivo());

NOTIFY pgrst, 'reload schema';
