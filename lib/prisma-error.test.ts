// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { camposDaColisaoUnica } from "./prisma-error";

/**
 * Constrói o erro P2002 na forma REAL de produção: Postgres + `@prisma/adapter-pg`.
 *
 * A forma foi verificada por leitura do bundle instalado:
 * `@prisma/adapter-pg/dist/index.js:472-478` monta
 * `{ kind: "UniqueConstraintViolation", constraint: { fields } }` e o entrega
 * como `.cause` de um `DriverAdapterError` (cuja `name` é exatamente essa
 * string — `@prisma/driver-adapter-utils/dist/index.js:43-50`);
 * `@prisma/query-plan-executor/dist/index.js:106172-106181` embrulha esse erro
 * em `meta: { driverAdapterError }`. O `modelName` é acrescentado por uma camada
 * acima e aparece no stack trace real.
 *
 * A `message` imita a real de propósito: uma falha de teste deve se parecer com
 * a falha de produção.
 */
function erroDoDriverAdapter(campos: string[]): Prisma.PrismaClientKnownRequestError {
  const driverAdapterError = new Error(
    `Unique constraint failed on the fields: (\`${campos.join("`, `")}\`)`,
    { cause: { kind: "UniqueConstraintViolation", constraint: { fields: campos } } }
  );
  driverAdapterError.name = "DriverAdapterError";

  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (\`${campos.join("`, `")}\`)`,
    {
      code: "P2002",
      clientVersion: "7.9.1",
      meta: { modelName: "Usuario", driverAdapterError },
    }
  );
}

/**
 * Constrói o erro P2002 na forma ANTIGA, `meta.target` — o contrato público e
 * documentado do Prisma. Este caminho não é o que o runtime deste projeto
 * produz hoje (achado 1), mas é o que uma versão futura ou um contexto sem
 * driver adapter produziria, e é por isso que ele tem precedência (D-C).
 */
function erroNoFormatoAntigo(target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.9.1",
    meta: { target },
  });
}

/** Atalho para os casos malformados: monta um P2002 com o `meta` que for dado. */
function erroComMeta(meta: Record<string, unknown> | undefined): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.9.1",
    meta,
  });
}

describe("camposDaColisaoUnica — formato do driver adapter", () => {
  it("extrai o campo de meta.driverAdapterError.cause.constraint.fields", () => {
    expect(camposDaColisaoUnica(erroDoDriverAdapter(["email"]))).toEqual(["email"]);
  });

  it("extrai os dois nomes de uma constraint composta, na mesma ordem", () => {
    // A ordem vem do `.split(", ")` sobre o `detail` do Postgres
    // (`@prisma/adapter-pg/dist/index.js:473`); preservá-la é o que permite ao
    // chamador distinguir qual coluna lidera a constraint.
    expect(camposDaColisaoUnica(erroDoDriverAdapter(["empresaId", "codigo"]))).toEqual([
      "empresaId",
      "codigo",
    ]);
  });
});

describe("camposDaColisaoUnica — formato antigo e precedência", () => {
  it("extrai o campo de meta.target", () => {
    expect(camposDaColisaoUnica(erroNoFormatoAntigo(["email"]))).toEqual(["email"]);
  });

  it("dá precedência a meta.target quando os DOIS formatos estão presentes", () => {
    // D-C: `target` é o contrato público. Se um dia ele voltar a ser preenchido,
    // o projeto migra de volta sozinho, sem edição.
    const erro = erroDoDriverAdapter(["slug"]);
    erro.meta = { ...erro.meta, target: ["email"] };

    expect(camposDaColisaoUnica(erro)).toEqual(["email"]);
  });

  it("cai para o driver adapter quando meta.target está presente porém vazio", () => {
    // Vazio não é resposta, é ausência (D-C).
    const erro = erroDoDriverAdapter(["slug"]);
    erro.meta = { ...erro.meta, target: [] };

    expect(camposDaColisaoUnica(erro)).toEqual(["slug"]);
  });
});

describe("camposDaColisaoUnica — formas ausentes ou malformadas", () => {
  it("devolve [] quando meta está ausente por completo", () => {
    expect(camposDaColisaoUnica(erroComMeta(undefined))).toEqual([]);
  });

  it("devolve [] quando o driver adapter veio sem constraint", () => {
    // Estado REAL de runtime, não hipótese defensiva: quando a regex não casa
    // no `detail` do Postgres, `constraint` sai `undefined`
    // (`@prisma/adapter-pg/dist/index.js:476`).
    const driverAdapterError = new Error("Unique constraint failed", {
      cause: { kind: "UniqueConstraintViolation", constraint: undefined },
    });
    driverAdapterError.name = "DriverAdapterError";

    expect(camposDaColisaoUnica(erroComMeta({ driverAdapterError }))).toEqual([]);
  });

  it("devolve [] quando meta.target é uma string em vez de array, sem lançar", () => {
    expect(camposDaColisaoUnica(erroNoFormatoAntigo("email"))).toEqual([]);
  });

  it("cai para o driver adapter quando meta.target é uma string e há fallback", () => {
    const erro = erroDoDriverAdapter(["slug"]);
    erro.meta = { ...erro.meta, target: "slug" };

    expect(camposDaColisaoUnica(erro)).toEqual(["slug"]);
  });

  it("devolve [] quando meta.driverAdapterError é null, string ou objeto sem cause", () => {
    expect(camposDaColisaoUnica(erroComMeta({ driverAdapterError: null }))).toEqual([]);
    expect(camposDaColisaoUnica(erroComMeta({ driverAdapterError: "boom" }))).toEqual([]);
    expect(camposDaColisaoUnica(erroComMeta({ driverAdapterError: {} }))).toEqual([]);
    expect(camposDaColisaoUnica(erroComMeta({ driverAdapterError: { cause: null } }))).toEqual([]);
    expect(
      camposDaColisaoUnica(erroComMeta({ driverAdapterError: { cause: { constraint: "email" } } }))
    ).toEqual([]);
  });

  it("devolve [] quando fields contém elementos não-string, sem lançar", () => {
    const driverAdapterError = new Error("Unique constraint failed", {
      cause: { kind: "UniqueConstraintViolation", constraint: { fields: ["email", 42] } },
    });
    driverAdapterError.name = "DriverAdapterError";

    expect(camposDaColisaoUnica(erroComMeta({ driverAdapterError }))).toEqual([]);
  });

  it("nunca lança, por mais malformada que seja a entrada (D-D / T-Q09-03)", () => {
    // Um helper que lançasse DENTRO do `catch` do cadastro converteria um 409
    // tratado em 500 não tratado.
    const formasHostis: unknown[] = [
      undefined,
      null,
      "nada disso",
      42,
      [],
      { target: { 0: "email" } },
      { driverAdapterError: { cause: { constraint: { fields: null } } } },
      { driverAdapterError: { cause: { constraint: { fields: [] } } } },
      { driverAdapterError: { cause: { constraint: { fields: [{}] } } } },
    ];

    for (const forma of formasHostis) {
      const erro = erroComMeta(forma as Record<string, unknown> | undefined);
      expect(() => camposDaColisaoUnica(erro)).not.toThrow();
      expect(camposDaColisaoUnica(erro)).toEqual([]);
    }
  });
});
