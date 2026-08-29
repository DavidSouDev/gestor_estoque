// Os métodos *.update/delete/toggle* dos services operam só pelo `id`, sem
// filtrar por empresaId — então qualquer mutação disparada a partir do admin
// precisa confirmar aqui que o registro pertence à empresa da sessão antes
// de tocar nele, senão um id de outra empresa passaria intacto.
export async function assertBelongsToEmpresa<T extends { empresaId: string } | null | undefined>(
  record: T,
  empresaId: string,
  mensagem = "Registro não encontrado."
): Promise<NonNullable<T>> {
  if (!record || record.empresaId !== empresaId) {
    throw new Error(mensagem);
  }

  return record as NonNullable<T>;
}
