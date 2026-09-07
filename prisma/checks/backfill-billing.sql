-- Gate de invariantes do backfill de billing (migration *_add_billing_a_empresa).
--
-- Arquivo VERSIONADO: e o gate de regressao do backfill, nao um script descartavel.
-- Uso: npx prisma db execute --file prisma/checks/backfill-billing.sql
--   exit 0 => as 5 invariantes passam contra os dados reais
--   exit 1 => a mensagem da excecao diz qual invariante quebrou e o valor observado
--
-- Contexto: "Empresa"."trialFim" e TIMESTAMP(3) sem fuso, guardando o INSTANTE UTC
-- correspondente a meia-noite de America/Sao_Paulo (D-01). Por isso toda comparacao
-- aqui reconstroi o instante com AT TIME ZONE 'UTC' antes de compara-lo.

DO $$
DECLARE
  v_sem_trial        bigint;
  v_horas_erradas    text;
  v_no_passado       bigint;
  v_ativas_com_trial bigint;
  v_backfill         bigint;
  v_backfill_torto   bigint;
  v_com_tz_utc       timestamp;
  v_com_tz_sp        timestamp;
BEGIN
  -- INV-1 (D-11): nenhuma empresa ativa pode ficar sem trialFim apos o backfill.
  SELECT count(*) INTO v_sem_trial
  FROM "Empresa"
  WHERE "deletedAt" IS NULL
    AND "trialFim" IS NULL;

  IF v_sem_trial > 0 THEN
    RAISE EXCEPTION 'INV-1 falhou (D-11): % empresa(s) ativa(s) com "trialFim" IS NULL', v_sem_trial;
  END IF;

  -- INV-2 (D-01 / Pitfall 4): o instante gravado e a meia-noite EM SAO PAULO.
  -- Uma migration que gravasse a meia-noite UTC faria esta assercao falhar com 21:00:00.
  SELECT string_agg(DISTINCT horario::text, ', ')
  INTO v_horas_erradas
  FROM (
    SELECT (("trialFim" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::time AS horario
    FROM "Empresa"
    WHERE "deletedAt" IS NULL
      AND (("trialFim" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::time <> TIME '00:00:00'
  ) AS desalinhados;

  IF v_horas_erradas IS NOT NULL THEN
    RAISE EXCEPTION 'INV-2 falhou (D-01/Pitfall 4): "trialFim" nao cai na meia-noite de America/Sao_Paulo; horarios locais observados: %', v_horas_erradas;
  END IF;

  -- INV-3 (criterio de sucesso #5): nenhuma empresa ativa pode acabar em carencia
  -- ou bloqueada por efeito colateral do backfill.
  SELECT count(*) INTO v_no_passado
  FROM "Empresa"
  WHERE "deletedAt" IS NULL
    AND ("trialFim" AT TIME ZONE 'UTC') <= now();

  IF v_no_passado > 0 THEN
    RAISE EXCEPTION 'INV-3 falhou (criterio #5): % empresa(s) ativa(s) com "trialFim" no passado (agora = %)', v_no_passado, now();
  END IF;

  -- INV-4 (D-12): uma linha de auditoria BACKFILL por empresa ativa backfillada,
  -- toda ela com statusAnterior NULL e statusNovo TRIAL.
  SELECT count(*) INTO v_ativas_com_trial
  FROM "Empresa"
  WHERE "deletedAt" IS NULL
    AND "trialFim" IS NOT NULL;

  SELECT count(*) INTO v_backfill
  FROM "AuditoriaAcesso"
  WHERE causa = 'BACKFILL';

  IF v_backfill <> v_ativas_com_trial THEN
    RAISE EXCEPTION 'INV-4 falhou (D-12): % linha(s) de auditoria BACKFILL para % empresa(s) ativa(s) com trialFim', v_backfill, v_ativas_com_trial;
  END IF;

  SELECT count(*) INTO v_backfill_torto
  FROM "AuditoriaAcesso"
  WHERE causa = 'BACKFILL'
    AND ("statusAnterior" IS NOT NULL OR "statusNovo" <> 'TRIAL');

  IF v_backfill_torto > 0 THEN
    RAISE EXCEPTION 'INV-4 falhou (D-12): % linha(s) BACKFILL com "statusAnterior" nao-nulo ou "statusNovo" diferente de TRIAL', v_backfill_torto;
  END IF;

  -- INV-5: a expressao do backfill nao pode depender do parametro TimeZone da sessao.
  -- Avalia a MESMA expressao com dois TimeZone diferentes e exige resultado identico.
  PERFORM set_config('TimeZone', 'UTC', true);
  SELECT (
           date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo') + interval '15 days')
           AT TIME ZONE 'America/Sao_Paulo'
         ) AT TIME ZONE 'UTC'
  INTO v_com_tz_utc;

  PERFORM set_config('TimeZone', 'America/Sao_Paulo', true);
  SELECT (
           date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo') + interval '15 days')
           AT TIME ZONE 'America/Sao_Paulo'
         ) AT TIME ZONE 'UTC'
  INTO v_com_tz_sp;

  IF v_com_tz_utc IS DISTINCT FROM v_com_tz_sp THEN
    RAISE EXCEPTION 'INV-5 falhou: a expressao do backfill depende do TimeZone da sessao (UTC => %, America/Sao_Paulo => %)', v_com_tz_utc, v_com_tz_sp;
  END IF;

  RAISE NOTICE 'backfill-billing: INV-1..INV-5 OK (% empresa(s) ativa(s), % linha(s) BACKFILL)', v_ativas_com_trial, v_backfill;
END
$$;
