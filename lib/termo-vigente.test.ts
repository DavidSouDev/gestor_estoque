// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/tests/setup/prisma-mock";
import { termoVigente } from "./termo-vigente";

const termoV3 = {
  id: "termo-3",
  versao: 3,
  conteudo: "Termos de uso, versao 3.",
  publicadoEm: new Date("2026-03-01T03:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("termoVigente", () => {
  it("devolve null quando NAO ha nenhum termo publicado — nao lanca", async () => {
    // A tabela vazia é um estado legítimo (banco novo, antes do seed) e o `null`
    // dele NÃO gateia ninguém: o gate de TERM-04 falha ABERTO. Se esta função
    // lançasse, a assimetria deliberada do RESEARCH viraria indisponibilidade
    // total — todos os tenants de uma vez.
    prismaMock.termoDeUso.findFirst.mockResolvedValue(null as never);

    await expect(termoVigente()).resolves.toBeNull();
  });

  it("projeta exatamente id, versao, conteudo e publicadoEm — nada mais", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue(termoV3 as never);

    const vigente = await termoVigente();

    expect(vigente).toEqual(termoV3);
    // `select` explícito (C-06), nunca `include`: o consumidor recebe os 4
    // campos que a tela precisa e nada do resto da linha.
    expect(prismaMock.termoDeUso.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, versao: true, conteudo: true, publicadoEm: true },
      })
    );
  });

  it("ordena por publicadoEm desc e desempata por versao desc, nessa ordem", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue(termoV3 as never);

    await termoVigente();

    // A ORDEM dos dois critérios é o contrato: `publicadoEm` decide, `versao` só
    // desempata. Invertê-los faria uma v4 publicada por engano com data antiga
    // passar na frente da v3 vigente.
    expect(prismaMock.termoDeUso.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ publicadoEm: "desc" }, { versao: "desc" }],
      })
    );
  });

  it("com varias linhas, devolve a de publicadoEm mais recente", async () => {
    // O banco resolve a ordenação; o que este teste prova é que a função devolve
    // a PRIMEIRA linha da ordenação pedida, sem re-ordenar em memória.
    const maisRecente = {
      id: "termo-4",
      versao: 4,
      conteudo: "Termos de uso, versao 4.",
      publicadoEm: new Date("2026-06-01T03:00:00.000Z"),
    };
    prismaMock.termoDeUso.findFirst.mockResolvedValue(maisRecente as never);

    await expect(termoVigente()).resolves.toEqual(maisRecente);
  });

  it("empate de publicadoEm e desempatado pela maior versao", async () => {
    const empateVenceMaiorVersao = {
      id: "termo-5",
      versao: 5,
      conteudo: "Termos de uso, versao 5.",
      publicadoEm: new Date("2026-06-01T03:00:00.000Z"),
    };
    prismaMock.termoDeUso.findFirst.mockResolvedValue(empateVenceMaiorVersao as never);

    const vigente = await termoVigente();

    expect(vigente?.versao).toBe(5);
    const [args] = prismaMock.termoDeUso.findFirst.mock.calls.at(-1) as [
      { orderBy: Array<Record<string, string>> },
    ];
    // Segundo critério presente e descendente: sem ele, o desempate ficaria a
    // cargo da ordem física da tabela, que não é determinística.
    expect(args.orderBy[1]).toEqual({ versao: "desc" });
  });

  it("nunca usa include — apenas select explicito (C-06)", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue(termoV3 as never);

    await termoVigente();

    const [args] = prismaMock.termoDeUso.findFirst.mock.calls.at(-1) as [
      Record<string, unknown>,
    ];
    expect(args).not.toHaveProperty("include");
  });

  it("e memoizavel por request: zero argumentos e argumento de query estavel", async () => {
    // POR QUE ESTE TESTE NÃO AFIRMA `toHaveBeenCalledTimes(1)`:
    //
    // `React.cache` só memoiza dentro do escopo de um request/render — em React
    // 19 o dispatcher (`ReactSharedInternals.A`) é `null` fora dele e a função
    // embrulhada simplesmente delega para a original, SEM cache. Em Vitest
    // (ambiente `node`, sem render de RSC) as duas chamadas abaixo disparam duas
    // queries, e afirmar o contrário aqui seria afirmar algo falso sobre o
    // ambiente de teste, não sobre o código. A asserção de deduplicação real
    // pertence ao nível e2e/integração, onde existe um request de verdade.
    //
    // O que ESTE nível consegue provar são as duas pré-condições sem as quais a
    // memoização nunca aconteceria, nem num request real:
    // (a) aridade zero — a chave do cache do React são os argumentos; um
    //     parâmetro qualquer aqui daria uma chave por chamador e mataria o
    //     compartilhamento entre layout, page e componentes do mesmo render;
    // (b) argumento de query estável — a mesma projeção e a mesma ordenação em
    //     toda chamada, sem nada derivado do relógio ou do chamador.
    prismaMock.termoDeUso.findFirst.mockResolvedValue(termoV3 as never);

    expect(termoVigente.length).toBe(0);

    await termoVigente();
    await termoVigente();

    const chamadas = prismaMock.termoDeUso.findFirst.mock.calls;
    expect(chamadas[0]).toEqual(chamadas[1]);
    expect(chamadas[0][0]).toEqual({
      orderBy: [{ publicadoEm: "desc" }, { versao: "desc" }],
      select: { id: true, versao: true, conteudo: true, publicadoEm: true },
    });
  });
});
