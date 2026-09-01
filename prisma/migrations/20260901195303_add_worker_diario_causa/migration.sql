-- Fase 5 (WRK-01): causa de transicao gravada pelo worker diario de reconciliacao.
--
-- Pitfall 7: esta migration APENAS adiciona o valor 'WORKER_DIARIO' ao enum.
-- Nao ha (e nao pode haver) nenhum INSERT/UPDATE que USE esse valor aqui: o
-- prisma migrate roda cada migration em transacao, e o Postgres recusa usar um
-- valor de enum adicionado dentro da mesma transacao. Um backfill que precise da
-- nova causa vai em uma SEGUNDA migration.
--
-- Nenhuma coluna de status/carencia e criada: status de acesso e derivado por
-- avaliarAcesso() sobre os fatos de billing, nunca armazenado (BILL-01 / D-16).

-- AlterEnum
ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WORKER_DIARIO';
