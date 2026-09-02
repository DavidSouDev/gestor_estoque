-- Fase 6 (TERM-01/TERM-03 / D-12 resolvido): v1 dos termos de uso, semeada por
-- MIGRATION e nao por script de seed.
--
-- Por que migration: a CI roda `npx prisma generate` seguido de
-- `npx prisma migrate deploy` e NADA MAIS — nao ha passo de seed em
-- .github/workflows/tests.yml. Os 9 specs e2e registram empresa pela UI de
-- /registro, e /registro passa a exigir um termo vigente para gravar o aceite
-- obrigatorio. Sem esta linha, um banco limpo (inclusive o da CI) deixa o
-- cadastro inoperante e derruba a suite e2e inteira, nao so os testes de termos.
-- Migration e o unico ponto que TODO ambiente atravessa.
--
-- `publicadoPorId` e NULL de proposito: a v1 nao tem autor humano, por
-- construcao. E o unico caso legitimo de autor nulo.
--
-- ATENCAO — o texto abaixo NAO deve ser substituido por UPDATE. Publicar e
-- INSERT, sempre (TERM-03 / D-07): a versao juridica real nasce como v2, pelo
-- endpoint POST /api/termos de TERM-02, restrito ao SUPERADMIN. Trocar este
-- texto por UPDATE apagaria a prova de qual documento os usuarios que ja
-- aceitaram a v1 realmente viram.
--
-- `ON CONFLICT ("versao") DO NOTHING` torna a reaplicacao inofensiva num banco
-- que ja tenha a v1 (idempotencia da mesma natureza da do aceite).

INSERT INTO "TermoDeUso" ("id", "versao", "conteudo", "publicadoEm", "publicadoPorId")
VALUES (
  gen_random_uuid(),
  1,
  '[TEXTO PROVISORIO - substituir publicando uma nova versao via POST /api/termos antes do go-live]

Este servico e um gestor de estoque e catalogo online multi-tenant: cada empresa cadastra seus produtos, controla o proprio estoque e publica um catalogo publico para os seus clientes. Ao criar uma conta, voce declara que os dados informados sao verdadeiros, que e responsavel pelo conteudo que cadastra e pelo uso que faz do painel administrativo, e que o acesso depende da assinatura ativa do plano contratado. Este texto e provisorio e sera substituido por uma nova versao dos termos, que precisara ser aceita novamente.',
  now(),
  NULL
)
ON CONFLICT ("versao") DO NOTHING;
