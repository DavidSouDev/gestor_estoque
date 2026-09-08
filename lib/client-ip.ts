/**
 * Extrai o IP do chamador a partir de headers HTTP, priorizando sinais que um
 * reverse proxy bem configurado SOBRESCREVE (nunca repassa do cliente) sobre
 * os que ele só ANEXA a uma cadeia potencialmente iniciada pelo próprio
 * cliente.
 *
 * `x-real-ip` é preferido quando presente porque um proxy bem configurado
 * (nginx `proxy_set_header X-Real-IP $remote_addr`) SOBRESCREVE esse header
 * com o IP da conexão TCP real, nunca repassando um valor vindo do cliente.
 * Já `x-forwarded-for` é uma CADEIA que proxies bem-comportados
 * (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`) apenas
 * ANEXAM ao final — o cliente pode enviar esse header com qualquer valor, que
 * vira o PRIMEIRO elo da cadeia. Ler o primeiro elo é ler exatamente o campo
 * que um atacante controla; o ÚLTIMO elo é o que o proxy mais próximo da
 * aplicação de fato anexou, e é o único em que dá para confiar sem saber
 * quantos proxies existem na frente.
 *
 * Sem nenhum dos dois headers (dev local, ou VPS mal configurado), toda
 * chamada cai no mesmo balde `"desconhecido"` — mitiga o caso comum (uma
 * origem automatizando o endpoint), não é uma garantia distribuída.
 */
export function extrairIpDoChamador(headers: Headers): string {
  const ipReal = headers.get("x-real-ip")?.trim();

  if (ipReal) {
    return ipReal;
  }

  const encaminhado = headers.get("x-forwarded-for");

  if (!encaminhado) {
    return "desconhecido";
  }

  const cadeia = encaminhado
    .split(",")
    .map((endereco) => endereco.trim())
    .filter(Boolean);

  return cadeia[cadeia.length - 1] || "desconhecido";
}
