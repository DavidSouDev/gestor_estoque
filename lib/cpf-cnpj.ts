/**
 * Validação de CPF/CNPJ pelo algoritmo padrão de dígitos verificadores
 * (módulo 11). Usado no cadastro público (registro/actions.ts) para garantir
 * que o documento exigido para travar o trial (Empresa.cpfCnpj) é, no mínimo,
 * um número real — não impede identidade forjada, só formato inválido e
 * sequências óbvias (`00000000000` etc., que passam no cálculo do dígito mas
 * nunca são documentos reais).
 */

export function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

function digitosRepetidos(digitos: string): boolean {
  return digitos.split("").every((digito) => digito === digitos[0]);
}

function calcularDigitoVerificador(base: string, pesos: number[]): number {
  const soma = base
    .split("")
    .reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);

  const resto = soma % 11;

  return resto < 2 ? 0 : 11 - resto;
}

function cpfValido(digitos: string): boolean {
  if (digitos.length !== 11 || digitosRepetidos(digitos)) {
    return false;
  }

  const pesos1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

  const digito1 = calcularDigitoVerificador(digitos.slice(0, 9), pesos1);
  const digito2 = calcularDigitoVerificador(digitos.slice(0, 9) + digito1, pesos2);

  return digitos === digitos.slice(0, 9) + digito1 + digito2;
}

function cnpjValido(digitos: string): boolean {
  if (digitos.length !== 14 || digitosRepetidos(digitos)) {
    return false;
  }

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const digito1 = calcularDigitoVerificador(digitos.slice(0, 12), pesos1);
  const digito2 = calcularDigitoVerificador(digitos.slice(0, 12) + digito1, pesos2);

  return digitos === digitos.slice(0, 12) + digito1 + digito2;
}

/** Espera o valor já normalizado (só dígitos) — chame `normalizarDocumento` antes. */
export function documentoValido(digitos: string): boolean {
  if (digitos.length === 11) {
    return cpfValido(digitos);
  }

  if (digitos.length === 14) {
    return cnpjValido(digitos);
  }

  return false;
}
