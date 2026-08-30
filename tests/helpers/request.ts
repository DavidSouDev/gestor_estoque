export function buildRequest(options: {
  method?: string;
  url?: string;
  token?: string;
  body?: unknown;
}): Request {
  const { method = "GET", url = "http://localhost/api/test", token, body } = options;

  const headers = new Headers();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function buildParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
