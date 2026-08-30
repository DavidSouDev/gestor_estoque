import { describe, expect, it } from "vitest";
import { prismaMock } from "../tests/setup/prisma-mock";
import { generateUniqueSlug } from "./slug";

describe("generateUniqueSlug", () => {
  it("retorna o slug base quando não há conflito", async () => {
    prismaMock.empresa.findMany.mockResolvedValue([]);

    await expect(generateUniqueSlug("Loja do João")).resolves.toBe("loja-do-joao");
  });

  it("consulta empresas cujo slug começa com o slug base", async () => {
    prismaMock.empresa.findMany.mockResolvedValue([]);

    await generateUniqueSlug("Loja do João");

    expect(prismaMock.empresa.findMany).toHaveBeenCalledWith({
      where: { slug: { startsWith: "loja-do-joao" } },
      select: { slug: true },
    });
  });

  it("adiciona sufixo quando o slug base já está em uso", async () => {
    prismaMock.empresa.findMany.mockResolvedValue([
      { slug: "loja-do-joao" },
    ] as never);

    await expect(generateUniqueSlug("Loja do João")).resolves.toBe("loja-do-joao-2");
  });
});
