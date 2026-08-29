export function pickUniqueWithSuffix(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }

  let sufixo = 2;

  while (taken.has(`${base}-${sufixo}`)) {
    sufixo += 1;
  }

  return `${base}-${sufixo}`;
}
