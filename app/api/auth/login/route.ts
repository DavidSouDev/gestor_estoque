import { usuarioService } from "../../../services/usuario.service";
import { signAuthToken } from "@/lib/jwt";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, senha } = body as { email?: string; senha?: string };

    if (!email || !senha) {
      return NextResponse.json(
        {
          message: "Informe email e senha.",
        },
        {
          status: 400,
        }
      );
    }

    const usuario = await usuarioService.validatePassword(email, senha);

    // Mesma condição que o DAL aplica na revalidação: quem for rejeitado lá no
    // request seguinte já é rejeitado aqui na entrada, sem emitir token de 7
    // dias. Checagem por veracidade (e não `!== null`) para tratar o campo
    // ausente como "não removida".
    if (!usuario || !usuario.ativo || usuario.empresa.deletedAt) {
      return NextResponse.json(
        {
          message: "Email ou senha inválidos.",
        },
        {
          status: 401,
        }
      );
    }

    const token = await signAuthToken({
      sub: usuario.id,
      empresaId: usuario.empresaId,
      empresaSlug: usuario.empresa.slug,
      email: usuario.email,
      role: usuario.role,
    });

    return NextResponse.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        empresaId: usuario.empresaId,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao autenticar.",
      },
      {
        status: 500,
      }
    );
  }
}
