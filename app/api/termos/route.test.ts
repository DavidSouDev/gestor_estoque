// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, UserRole } from "@prisma/client";

import { buildRequest } from "@/tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "@/tests/helpers/auth";
import { verifyAuthToken } from "@/lib/jwt";
import { prismaMock } from "@/tests/setup/prisma-mock";

import { POST } from "./route";

/**
 * Primeiro teste de rota ROLE-GATED do projeto (TERM-02). Não havia análogo
 * antes desta fase, e a razão pela qual ele não é uma cópia de
 * `app/api/produtos/route.test.ts` é uma só, e é a coisa mais importante do
 * arquivo:
 *
 * **`buildAuthToken` altera o TOKEN. Quem autoriza é o BANCO.**
 *
 * A role que decide sai de `prismaMock.usuario.findFirst`, que é a query de
 * `revalidarConta`. Um teste que apenas trocasse `role` no token e esperasse
 * 201 estaria testando a implementação ERRADA — e, se passasse, provaria que o
 * handler caiu no Pitfall 2 e que a fase inteira embarca uma escalação de
 * privilégio com janela de 7 dias. Por isso o par completo abaixo: o caso de
 * NÃO-VACUIDADE (token diz SUPERADMIN, banco diz ADMIN → 403) e o caso
 * positivo (token e banco dizem SUPERADMIN → 201).
 *
 * `// @vitest-environment node` na primeira linha é obrigatório: o default do
 * projeto é jsdom. Precedente direto em `app/api/webhooks/asaas/route.test.ts`.
 *
 * O service NÃO é mockado. As asserções deste arquivo são sobre o que chega ao
 * `prismaMock` (o `conteudo` publicado, o `publicadoPorId`) e sobre como um
 * P2002 do banco vira 409 na resposta — mockar `termoService` apagaria
 * exatamente essa cadeia.
 */

const URL_TERMOS = "http://localhost/api/termos";

/**
 * Reescreve a conta que `revalidarConta` vai encontrar, preservando TODOS os
 * campos do stub global de `tests/setup/prisma-mock.ts` e trocando só a role.
 *
 * Preservar o resto não é zelo decorativo: `requireAuth` avalia os fatos de
 * billing ANTES de o handler chegar na checagem de papel. Um stub que trocasse
 * a role e zerasse `trialFim` colocaria a empresa em BLOQUEADO, a guarda
 * responderia com o status de assinatura suspensa, e o teste ficaria verde ou
 * vermelho por um motivo que não tem nada a ver com o papel — mascarando
 * justamente aquilo que ele existe para provar.
 */
function mockContaComRole(role: UserRole) {
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@teste.com",
    role,
    empresaId: "empresa-1",
    termoAceitoId: "termo-1",
    updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    empresa: {
      slug: "empresa-teste",
      acessoAte: null,
      trialFim: new Date("2099-01-01T03:00:00.000Z"),
      canceladoEm: null,
      acessoVitalicio: false,
      ultimoStatusAuditado: "TRIAL",
    },
  } as never);
}

function makeP2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "0.0.0",
    meta: { target },
  });
}

function publicar(token: string | undefined, body: unknown) {
  return POST(buildRequest({ method: "POST", url: URL_TERMOS, token, body }));
}

describe("POST /api/termos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("autorização (TERM-02 / D-06)", () => {
    it("retorna 401 para chamador anônimo", async () => {
      const response = await publicar(undefined, { conteudo: "Termos v2." });

      expect(response.status).toBe(401);
      expect(prismaMock.termoDeUso.create).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ CASO DE NÃO-VACUIDADE — não remova, não relaxe, não "simplifique".
     *
     * O token é assinado dizendo `role: SUPERADMIN`; o banco (stub global) diz
     * ADMIN. O esperado é 403.
     *
     * Se este caso um dia virar verde-com-201, NÃO é uma expectativa
     * desatualizada: significa que o handler passou a autorizar pelo payload do
     * JWT, e que qualquer SUPERADMIN rebaixado para ADMIN continua publicando
     * os termos da plataforma por até 7 dias — o tempo de vida do token. É a
     * falha de segurança que esta fase inteira existe para não ter.
     */
    it("retorna 403 quando o token DIZ SUPERADMIN mas o usuário no banco é ADMIN", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });
      mockContaComRole(UserRole.ADMIN);

      // As duas asserções abaixo são o que torna este caso NÃO-VACUOSO, e por
      // isso vêm antes de chamar o handler: elas provam que as duas fontes de
      // role realmente DISCORDAM neste cenário. Sem elas, um `buildAuthToken`
      // que silenciosamente ignorasse o override deixaria este teste verde por
      // acidente — token e banco diriam ADMIN, o 403 viria do motivo errado, e
      // a proteção contra o Pitfall 2 não estaria sendo medida por ninguém.
      const payloadDoToken = await verifyAuthToken(token);
      expect(payloadDoToken.role).toBe("SUPERADMIN");
      const contaNoBanco = await prismaMock.usuario.findFirst({});
      expect(contaNoBanco).toMatchObject({ role: "ADMIN" });

      const response = await publicar(token, { conteudo: "Termos v2." });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({ message: "Ação não permitida." });
      expect(prismaMock.termoDeUso.create).not.toHaveBeenCalled();
    });

    it("retorna 403 para ADMIN comum de qualquer empresa", async () => {
      const token = await buildAuthToken();
      mockContaComRole(UserRole.ADMIN);

      const response = await publicar(token, { conteudo: "Termos v2." });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({ message: "Ação não permitida." });
      expect(prismaMock.termoDeUso.create).not.toHaveBeenCalled();
    });

    it("retorna 201 quando o usuário é SUPERADMIN NO BANCO, publicando com o autor derivado da sessão", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });
      mockContaComRole(UserRole.SUPERADMIN);
      prismaMock.termoDeUso.create.mockResolvedValue({
        id: "termo-2",
        versao: 2,
        publicadoEm: new Date("2026-09-02T03:00:00.000Z"),
      } as never);

      // O corpo carrega um `publicadoPorId` HOSTIL de propósito: se ele
      // aparecesse na escrita, o autor do documento legal seria escolhido por
      // quem manda o JSON, e não pela sessão que o request provou (Pitfall 8).
      const response = await publicar(token, {
        conteudo: "  Termos de uso, versão 2.  ",
        publicadoPorId: "usuario-forjado",
      });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body).toMatchObject({ id: "termo-2", versao: 2 });

      const escrita = prismaMock.termoDeUso.create.mock.calls[0][0];
      expect(escrita.data.conteudo).toBe("Termos de uso, versão 2.");
      expect(escrita.data.publicadoPorId).toBe(testAuthPayload.sub);
      expect(escrita.data.publicadoPorId).not.toBe("usuario-forjado");
    });
  });

  describe("validação do corpo (ASVS V5)", () => {
    beforeEach(() => {
      // Todos os casos abaixo já passaram pelo portão de papel: o que está sob
      // teste é a validação, não a autorização. Com um ADMIN aqui, cada um
      // destes casos devolveria 403 e a validação nunca seria exercitada.
      mockContaComRole(UserRole.SUPERADMIN);
    });

    it("retorna 400 quando o corpo não tem conteudo", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });

      const response = await publicar(token, {});
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ message: "Corpo inválido." });
      expect(prismaMock.termoDeUso.create).not.toHaveBeenCalled();
    });

    it("retorna 400 quando conteudo é só espaços em branco", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });

      const response = await publicar(token, { conteudo: "   \n\t  " });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ message: "Corpo inválido." });
      expect(prismaMock.termoDeUso.create).not.toHaveBeenCalled();
    });

    it("retorna 400 quando conteudo passa de 200000 caracteres", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });

      const response = await publicar(token, { conteudo: "a".repeat(200_001) });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ message: "Corpo inválido." });
      expect(prismaMock.termoDeUso.create).not.toHaveBeenCalled();
    });

    it("aceita conteudo exatamente no teto de 200000 caracteres", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });
      prismaMock.termoDeUso.create.mockResolvedValue({
        id: "termo-2",
        versao: 2,
        publicadoEm: new Date("2026-09-02T03:00:00.000Z"),
      } as never);

      const response = await publicar(token, { conteudo: "a".repeat(200_000) });

      // O limite é inclusivo: sem este caso, trocar `max` por `lt` passaria
      // despercebido e o teto viraria 199999 sem ninguém notar.
      expect(response.status).toBe(201);
    });
  });

  describe("erros do service", () => {
    beforeEach(() => {
      mockContaComRole(UserRole.SUPERADMIN);
    });

    it("propaga 409 quando o banco recusa a versão por publicação concorrente", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });
      prismaMock.termoDeUso.create.mockRejectedValue(makeP2002(["versao"]));

      const response = await publicar(token, { conteudo: "Termos v2." });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.message).toContain("Tente novamente");
    });

    it("retorna 500 genérico sem vazar a mensagem do erro real", async () => {
      const token = await buildAuthToken({ role: "SUPERADMIN" });
      const console_error = vi.spyOn(console, "error").mockImplementation(() => {});
      const SEGREDO_DO_ERRO = "relation \"TermoDeUso\" nao existe em db-interno-9";
      prismaMock.termoDeUso.create.mockRejectedValue(new Error(SEGREDO_DO_ERRO));

      const response = await publicar(token, { conteudo: "Termos v2." });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({ message: "Erro ao publicar termos." });
      // T-06-24: o detalhe do erro fica no servidor. A asserção é sobre o corpo
      // INTEIRO serializado, não só sobre `message` — um campo extra de debug
      // acrescentado no futuro cairia aqui.
      expect(JSON.stringify(body)).not.toContain("db-interno-9");
      expect(console_error).toHaveBeenCalled();
    });
  });
});
