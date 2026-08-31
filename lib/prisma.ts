import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  return new PrismaClient({
    adapter,
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Atribuição incondicional, sem guarda por ambiente: em Next.js o cache de
// módulos do Node não basta, porque camadas de bundle distintas do servidor
// (rsc, ssr, api-node, action-browser, instrument) instanciam este módulo
// separadamente — cada instância abriria o seu próprio pg.Pool. globalThis é o
// único escopo compartilhado entre elas, então a atribuição precisa valer
// também em produção.
globalForPrisma.prisma = prisma;
