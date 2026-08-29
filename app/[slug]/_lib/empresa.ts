import { cache } from "react";
import { notFound } from "next/navigation";
import { empresaService } from "@/app/services/empresa.service";

export const getEmpresaCatalogo = cache(async (slug: string) => {
  const empresa = await empresaService.findBySlug(slug);

  if (!empresa) {
    notFound();
  }

  return empresa;
});
