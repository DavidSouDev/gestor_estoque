/**
 * `telefone`/`instagram` da Empresa são texto livre (sem máscara nem
 * validação de formato no cadastro) — por isso normalizamos aqui em vez de
 * montar o link direto no valor salvo, que pode vir com parênteses, traço,
 * `@`, ou a URL inteira do perfil.
 */

function normalizeTelefone(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");

  if (!digitos) {
    return null;
  }

  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return digitos.length >= 8 ? digitos : null;
}

export function whatsappLink(telefone: string, mensagem?: string) {
  const numero = normalizeTelefone(telefone);

  if (!numero) {
    return null;
  }

  const query = mensagem ? `?text=${encodeURIComponent(mensagem)}` : "";

  return `https://wa.me/${numero}${query}`;
}

export function instagramLink(instagram: string) {
  const handle = instagram
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?]/)[0];

  return handle ? `https://instagram.com/${handle}` : null;
}
