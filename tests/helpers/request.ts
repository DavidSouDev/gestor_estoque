export function buildRequest(options: {
  method?: string;
  url?: string;
  token?: string;
  body?: unknown;
  /**
   * Corpo enviado LITERALMENTE, sem passar por `JSON.stringify`. É o único jeito
   * de montar um request com corpo malformado — `body: "x"` viraria `"\"x\""`,
   * que é JSON válido. Usado pelo teste do webhook do Asaas.
   */
  rawBody?: string;
  /**
   * Headers arbitrários, aplicados por último (podem sobrescrever os default).
   * Necessário para credenciais que não são `Authorization: Bearer`, como o
   * `asaas-access-token` do webhook.
   */
  headers?: Record<string, string>;
}): Request {
  const {
    method = "GET",
    url = "http://localhost/api/test",
    token,
    body,
    rawBody,
    headers: extras,
  } = options;

  const headers = new Headers();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (body !== undefined || rawBody !== undefined) {
    headers.set("content-type", "application/json");
  }
  for (const [chave, valor] of Object.entries(extras ?? {})) {
    headers.set(chave, valor);
  }

  return new Request(url, {
    method,
    headers,
    body:
      rawBody !== undefined
        ? rawBody
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
  });
}

export function buildParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
