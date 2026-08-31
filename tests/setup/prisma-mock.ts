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
    empresa: {
      slug: "empresa-teste",
      acessoAte: null,
      trialFim: new Date("2099-01-01T03:00:00.000Z"),
      canceladoEm: null,
      acessoVitalicio: false,
      ultimoStatusAuditado: "TRIAL",
    },
  } as never);
});
