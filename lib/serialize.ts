import { Prisma } from "@prisma/client";

/**
 * Client Components só aceitam objetos planos como props — `Decimal` do
 * Prisma não serializa. Converte recursivamente qualquer Decimal (em
 * qualquer profundidade, incluindo dentro de arrays/relations) para number
 * antes de repassar dados de um Server Component para um "use client".
 */
export function serializeDecimals<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return Number(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeDecimals(item)) as unknown as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeDecimals(val);
    }

    return result as T;
  }

  return value;
}
