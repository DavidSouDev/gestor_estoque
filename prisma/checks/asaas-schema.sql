-- Gate de invariantes de schema da Fase 3 (migration *_add_asaas_webhook_ledger).
--
-- Arquivo VERSIONADO: e o gate de regressao do schema do gateway Asaas, nao um
-- script descartavel.
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/checks/asaas-schema.sql
--   (equivalente: npx prisma db execute --file prisma/checks/asaas-schema.sql)
--   exit 0 => as 6 invariantes passam contra o banco real
--   exit 1 => a mensagem da excecao diz qual invariante quebrou
--
-- Contexto: este gate consulta o CATALOGO DO POSTGRES (pg_enum, pg_index,
-- information_schema), nunca o prisma/schema.prisma. Essa distincao e o motivo
-- de o arquivo existir: `prisma validate` e `tsc --noEmit` leem o arquivo de
-- schema e passariam mesmo com a migration nao aplicada. So o catalogo prova
-- que a constraint existe no banco que vai receber os webhooks.

DO $$
DECLARE
  v_enum_ok        boolean;
  v_tabela_evento  boolean;
  v_tabela_ckout   boolean;
  v_uniq_evento    boolean;
  v_uniq_checkout  boolean;
  v_uniq_assinat   boolean;
  v_colunas_fila   bigint;
BEGIN
  -- INV-1 (GTW-03 / D-14): o valor WEBHOOK_PAGAMENTO existe no enum do BANCO.
  -- Sem isto, toda escrita de auditoria causada por webhook falha em runtime
  -- com 22P02, nao em tempo de compilacao.
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'CausaTransicaoAcesso'
      AND e.enumlabel = 'WEBHOOK_PAGAMENTO'
  ) INTO v_enum_ok;

  IF NOT v_enum_ok THEN
    RAISE EXCEPTION 'INV-1 falhou (GTW-03): valor WEBHOOK_PAGAMENTO ausente do enum "CausaTransicaoAcesso" no banco';
  END IF;

  -- INV-2 (GTW-02): a tabela do ledger existe.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'EventoWebhookAsaas'
  ) INTO v_tabela_evento;

  IF NOT v_tabela_evento THEN
    RAISE EXCEPTION 'INV-2 falhou (GTW-02): tabela "EventoWebhookAsaas" nao existe';
  END IF;

  -- INV-3 (GTW-04 / Pitfall 8): a tabela do mapa de checkout existe.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'CheckoutAsaas'
  ) INTO v_tabela_ckout;

  IF NOT v_tabela_ckout THEN
    RAISE EXCEPTION 'INV-3 falhou (GTW-04): tabela "CheckoutAsaas" nao existe';
  END IF;

  -- INV-4 (GTW-02 / T-03-01): indice UNICO sobre "EventoWebhookAsaas"("eventoId").
  -- Esta e A defesa contra entrega concorrente do mesmo evento. Um findFirst de
  -- aplicacao perde a corrida; so a constraint resolve. Se este gate falhar, a
  -- idempotencia do webhook e ficticia.
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c   ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
    WHERE c.relname = 'EventoWebhookAsaas'
      AND a.attname = 'eventoId'
      AND i.indisunique
      AND i.indnatts = 1
  ) INTO v_uniq_evento;

  IF NOT v_uniq_evento THEN
    RAISE EXCEPTION 'INV-4 falhou (GTW-02): constraint unica de "eventoId" ausente em "EventoWebhookAsaas"';
  END IF;

  -- INV-5 (GTW-04 / T-03-02): indice UNICO sobre "CheckoutAsaas"("asaasCheckoutId").
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c   ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
    WHERE c.relname = 'CheckoutAsaas'
      AND a.attname = 'asaasCheckoutId'
      AND i.indisunique
      AND i.indnatts = 1
  ) INTO v_uniq_checkout;

  IF NOT v_uniq_checkout THEN
    RAISE EXCEPTION 'INV-5 falhou (GTW-04): constraint unica de "asaasCheckoutId" ausente em "CheckoutAsaas"';
  END IF;

  -- INV-6 (GTW-04 / C-08 / T-03-02): indice UNICO sobre
  -- "Empresa"("asaasSubscriptionId"). E o que garante que uma assinatura do
  -- Asaas pertence a NO MAXIMO uma Empresa — sem isso, resolver o tenant por
  -- "sub_..." deixa de ser deterministico e vira IDOR.
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c   ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
    WHERE c.relname = 'Empresa'
      AND a.attname = 'asaasSubscriptionId'
      AND i.indisunique
      AND i.indnatts = 1
  ) INTO v_uniq_assinat;

  IF NOT v_uniq_assinat THEN
    RAISE EXCEPTION 'INV-6 falhou (GTW-04/C-08): constraint unica de "asaasSubscriptionId" ausente em "Empresa"';
  END IF;

  -- INV-7 (Pitfall 10 / Fase 5 WRK-01): a interface de recuperacao existe.
  -- "WHERE processadoEm IS NULL" e a fila de retrabalho que a Fase 5 vai drenar.
  -- Esta fase entrega apenas as colunas e o indice.
  SELECT count(*) INTO v_colunas_fila
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'EventoWebhookAsaas'
    AND column_name IN ('processadoEm', 'erro', 'tentativas');

  IF v_colunas_fila <> 3 THEN
    RAISE EXCEPTION 'INV-7 falhou (Pitfall 10): esperadas 3 colunas de recuperacao (processadoEm, erro, tentativas) em "EventoWebhookAsaas", encontradas %', v_colunas_fila;
  END IF;

  RAISE NOTICE 'asaas-schema: INV-1..INV-7 OK (enum, 2 tabelas, 3 constraints unicas, 3 colunas de fila)';
END
$$;
