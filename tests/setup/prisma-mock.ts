import { vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

const { prisma } = await import("@/lib/prisma");

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);

  // Default: a conta do `testAuthPayload` (tests/helpers/auth.ts) existe e está
  // ativa. Sem isto, `mockReset` deixa a query de revalidação devolvendo
  // `undefined`, `revalidarConta` cai no fail-closed (D-01) e todo teste que
  // hoje passa um Bearer token válido passaria a receber 401.
  // Testes do caminho revogado sobrescrevem no próprio caso, com
  // `mockResolvedValue(null)` ou `mockRejectedValue(...)`.
  // O stub tem que vir DEPOIS do `mockReset` e dentro deste mesmo `beforeEach`:
  // colocado no `beforeEach` de outro arquivo registrado antes, seria apagado.
  // A conta default também precisa carregar fatos de billing consistentes,
  // porque `revalidarConta` agora avalia acesso a cada chamada: um trial com fim
  // no futuro somado ao mesmo status já auditado é a combinação NEUTRA — produz
  // `TRIAL`, igual ao estado persistido, então nenhum teste existente passa a
  // agendar escrita de auditoria por efeito colateral. A data é um literal fixo
  // de propósito: um valor relativo ao relógio tornaria a suíte sensível ao
  // tempo, e vários testes daqui usam `vi.useFakeTimers()`.
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@teste.com",
    role: "ADMIN",
    empresaId: "empresa-1",
    termoAceitoId: "termo-1",
    empresa: {
      slug: "empresa-teste",
      acessoAte: null,
      trialFim: new Date("2099-01-01T03:00:00.000Z"),
      canceladoEm: null,
      acessoVitalicio: false,
      ultimoStatusAuditado: "TRIAL",
    },
  } as never);

  // Fase 6 (TERM-04): o par de stubs de termos acima e abaixo carrega a
  // combinação NEUTRA — existe termo vigente E a conta default já o aceitou (o
  // ponteiro de último aceite da conta e o `id` do vigente são o MESMO valor).
  //
  // A combinação foi escolhida assim de propósito. "Não há termo publicado"
  // também produziria `termosPendentes === false`, pela assimetria deliberada do
  // RESEARCH (o gate falha ABERTO sem termo publicado), mas esse caminho
  // curto-circuita a comparação e deixaria a regra sem cobertura de fundo; do
  // jeito escolhido, cada teste autenticado exercita a comparação do gate.
  //
  // A data é um literal fixo pelo mesmo motivo já registrado para `trialFim`:
  // vários testes daqui usam `vi.useFakeTimers()` e um valor relativo ao relógio
  // tornaria a suíte sensível ao tempo.
  //
  // Sem estes dois stubs, no instante em que o plano 06-04 acrescentar
  // `termosPendentes` a `ContaAtiva`, TODO teste autenticado existente passa a
  // receber redirect/403 de uma vez — exatamente a mesma regressão em massa que
  // a Fase 2 causou neste mesmo arquivo ao introduzir os fatos de billing.
  //
  // Testes que querem o caminho de termos PENDENTES sobrescrevem localmente: ou
  // zeram o ponteiro de último aceite da conta (`null`, usuário que nunca
  // aceitou), ou apontam-no para um `id` diferente do vigente (usuário que
  // aceitou uma versão antiga).
  prismaMock.termoDeUso.findFirst.mockResolvedValue({
    id: "termo-1",
    versao: 1,
    conteudo: "Termos de teste.",
    publicadoEm: new Date("2026-01-01T03:00:00.000Z"),
  } as never);
});
