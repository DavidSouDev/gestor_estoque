import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { pickUniqueWithSuffix } from "@/lib/unique-suffix";

export async function generateUniqueSlug(nome: string): Promise<string> {
  const base = slugify(nome);

  const existentes = await prisma.empresa.findMany({
    where: {
      slug: {
        startsWith: base,
      },
    },
    select: {
      slug: true,
    },
  });

  const ocupados = new Set(existentes.map((empresa) => empresa.slug));

  return pickUniqueWithSuffix(base, ocupados);
}
