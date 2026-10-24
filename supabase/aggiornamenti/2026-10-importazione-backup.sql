-- SPDX-License-Identifier: AGPL-3.0-or-later
-- SPDX-FileCopyrightText: 2026 Andrea Fantini
-- Termini aggiuntivi (AGPL-3.0, sezione 7): vedi TERMINI-AGGIUNTIVI.md
--
-- Aggiornamento ottobre 2026: importazione di un backup (pagina "Importa backup").
-- Da eseguire UNA volta nella SQL Editor dei progetti installati prima di questa versione.
-- Le nuove installazioni non ne hanno bisogno: è già incluso in schema.sql.
-- Non modifica né cancella dati.

CREATE OR REPLACE FUNCTION protocollo_importazione_in_corso()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(current_setting('protogal.importazione', true), '') = 'on' AND protocollo_is_admin();
$$;

CREATE OR REPLACE FUNCTION protocollo_proteggi_campi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SQL Editor / service role (manutenzione) e importazione di un backup
  -- (protocollo_importa_backup, solo admin): numeri, date e operatori restano quelli originali
  IF auth.uid() IS NULL OR protocollo_importazione_in_corso() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
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
    NEW.numero := protocollo_incrementa(NEW.anno, NEW.tipo_flusso);
  END IF;

  IF (NEW.data_registrazione IS DISTINCT FROM OLD.data_registrazione OR NEW.anno IS DISTINCT FROM OLD.anno)
     AND extract(year FROM NEW.data_registrazione AT TIME ZONE 'Europe/Rome')::int <> NEW.anno THEN
    RAISE EXCEPTION 'La data di protocollazione deve appartenere all''anno %', NEW.anno USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION contratti_proteggi_campi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR protocollo_importazione_in_corso() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.data_repertorio := now();
    NEW.operatore_id := auth.uid();
    NEW.anno := extract(year FROM now() AT TIME ZONE 'Europe/Rome')::int;
    INSERT INTO protocollo_contratti_sequenze (anno, ultimo_numero)
      VALUES (NEW.anno, 1)
      ON CONFLICT (anno) DO UPDATE
        SET ultimo_numero = protocollo_contratti_sequenze.ultimo_numero + 1,
            updated_at    = now()
    RETURNING ultimo_numero INTO NEW.numero;
    RETURN NEW;
  END IF;

  IF NOT protocollo_is_admin() AND (
       NEW.numero          IS DISTINCT FROM OLD.numero
    OR NEW.anno            IS DISTINCT FROM OLD.anno
    OR NEW.data_repertorio IS DISTINCT FROM OLD.data_repertorio
    OR NEW.operatore_id    IS DISTINCT FROM OLD.operatore_id
  ) THEN
    RAISE EXCEPTION 'Solo un amministratore può modificare numero, anno o data di repertorio'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.data_repertorio IS DISTINCT FROM OLD.data_repertorio OR NEW.anno IS DISTINCT FROM OLD.anno)
     AND extract(year FROM NEW.data_repertorio AT TIME ZONE 'Europe/Rome')::int <> NEW.anno THEN
    RAISE EXCEPTION 'La data di repertorio deve appartenere all''anno %', NEW.anno USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
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
      id, numero, anno, tipo_flusso, data_registrazione, data_documento, canale, oggetto,
      mittente_nome, mittente_email, mittente_pec, destinatario_nome, destinatario_email, destinatario_pec,
      ufficio_assegnatario, operatore_id, stato, note, protocollo_collegato,
      bloccato, bloccato_da, bloccato_il, created_at, updated_at)
    SELECT r.id, r.numero, r.anno, r.tipo_flusso, coalesce(r.data_registrazione, r.created_at, now()),
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
    INSERT INTO protocollo_sequenze (anno, tipo_flusso, ultimo_numero)
    SELECT anno, tipo_flusso, max(n) FROM (
      SELECT r.anno, r.tipo_flusso, r.ultimo_numero AS n
        FROM jsonb_to_recordset(p_righe -> 'protocolli') AS r(anno integer, tipo_flusso text, ultimo_numero integer)
      UNION ALL
      SELECT anno, tipo_flusso, numero FROM protocollo_registro
    ) t
    WHERE tipo_flusso IN ('arrivo', 'partenza')
    GROUP BY anno, tipo_flusso
    ON CONFLICT (anno, tipo_flusso) DO UPDATE
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
REVOKE ALL ON FUNCTION protocollo_importa_backup(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION protocollo_importa_backup(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
