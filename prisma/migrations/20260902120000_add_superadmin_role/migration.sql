-- Fase 6 (TERM-02 / D-01): papel de plataforma SUPERADMIN, o unico autorizado a
-- publicar novas versoes dos termos de uso.
--
-- Pitfall 1: esta migration APENAS adiciona o valor 'SUPERADMIN' ao enum
-- "UserRole". Nao ha (e nao pode haver) nenhum INSERT/UPDATE que USE esse valor
-- aqui: o prisma migrate roda cada migration dentro de uma transacao, e o
-- PostgreSQL recusa usar um valor de enum adicionado dentro da mesma transacao
-- ("ERROR: unsafe use of new value ... of enum type"). Qualquer DML que precise
-- do valor novo vai numa migration POSTERIOR.
--
-- Mesmo incidente ja documentado em 20260901195303_add_worker_diario_causa.
--
-- O usuario SUPERADMIN em si NAO nasce aqui: ele vem de um script de seed em
-- runtime (fora da transacao da migration), tanto pelo motivo acima quanto para
-- nao embutir um hash de senha no historico do repositorio para sempre.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN';
