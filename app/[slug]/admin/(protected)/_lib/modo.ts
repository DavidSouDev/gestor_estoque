import { empresaService } from "@/app/services/empresa.service";

export async function getModoInterface(empresaId: string): Promise<"SIMPLES" | "COMPLETO"> {
  const empresa = await empresaService.findHeaderData(empresaId);

  return empresa?.modoInterface ?? "COMPLETO";
}
