export function formatCurrency(value: unknown) {
  const numero = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numero) ? numero : 0);
}

export function formatDate(value: Date | string) {
  const data = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

export function formatDateTime(value: Date | string) {
  const data = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

/**
 * Máscara incremental de telefone BR, aplicada a cada tecla digitada — não é
 * validação. Alterna sozinha entre fixo (10 dígitos, "1234-5678") e celular
 * (11 dígitos, "91234-5678") pela contagem de dígitos já digitados, sem exigir
 * que o usuário escolha o formato. `lib/contato.ts` já normaliza o valor salvo
 * na hora de montar o link do WhatsApp, então esta máscara existe só para
 * evitar entrada suja (letras, parênteses/traços fora de lugar) — nunca
 * bloqueia o submit.
 */
export function formatPhoneInput(value: string): string {
  const digitos = value.replace(/\D/g, "").slice(0, 11);

  if (!digitos) {
    return "";
  }

  if (digitos.length <= 2) {
    return `(${digitos}`;
  }

  if (digitos.length <= 6) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  }

  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }

  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

/**
 * Reduz qualquer coisa que o usuário cole (URL completa, `@handle`, ou o
 * handle puro) ao mesmo handle limpo — mesma lógica de `instagramLink` em
 * `lib/contato.ts`, aplicada aqui na digitação para que o campo já mostre só
 * o handle em vez da URL colada inteira.
 */
export function formatInstagramHandle(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .split(/[/?]/)[0];
}
