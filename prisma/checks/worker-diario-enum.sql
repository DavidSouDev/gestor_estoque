-- Gate da invariante INV-05-01 (migration *_add_worker_diario_causa).
--
-- Arquivo VERSIONADO: e o gate de regressao do valor de enum que o worker diario
-- grava, nao um script descartavel.
-- Uso: npx prisma db execute --file prisma/checks/worker-diario-enum.sql
--   exit 0 => 'WORKER_DIARIO' existe no catalogo do Postgres alvo
--   exit 1 => a excecao diz que o valor esta ausente e o worker nao pode escrever
--
-- Contexto: ler o "prisma/schema.prisma" prova apenas a INTENCAO. O unico fato que
-- importa para o worker e o valor existir no catalogo do banco ALVO: um deploy que
-- aplique o schema num banco onde a migration nao rodou aceita o codigo e estoura
-- em runtime na primeira transicao gravada por /api/cron/reconciliacao-diaria.
-- Por isso a consulta abaixo le o catalogo de enums do Postgres, nunca o arquivo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'CausaTransicaoAcesso'
      AND e.enumlabel = 'WORKER_DIARIO'
  ) THEN
    RAISE EXCEPTION 'INV-05-01 falhou: WORKER_DIARIO ausente do enum CausaTransicaoAcesso';
  END IF;

  RAISE NOTICE 'worker-diario-enum: INV-05-01 OK (WORKER_DIARIO presente em CausaTransicaoAcesso)';
END
$$;
