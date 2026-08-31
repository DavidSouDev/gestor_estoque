import { prisma } from "@/lib/prisma";
import { produtoService } from "./produto.service";
import { comboService } from "./combo.service";
import { promocaoService } from "./promocao.service";
import { generateUniqueSlug } from "@/lib/slug";
import { HttpError } from "@/lib/http-error";
import { CausaTransicaoAcesso, ModoInterface, Prisma, StatusAcesso } from "@prisma/client";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import { DIAS_DE_TRIAL } from "@/lib/avaliar-acesso";
import bcrypt from "bcryptjs";

export interface RegisterComUsuarioDTO {
  nomeEmpresa: string;
  nomeResponsavel: string;
  email: string;
  senha: string;
  modoInterface: ModoInterface;
}

export interface CreateEmpresaDTO {
  nome: string;
  slug: string;

  logo?: string;
  banner?: string;
  descricao?: string;

  telefone?: string;
  instagram?: string;

  primaryColor?: string;
  accentColor?: string;
}

export interface UpdateEmpresaDTO {
  nome?: string;
  slug?: string;

  logo?: string;
  banner?: string;
  descricao?: string;

  telefone?: string;
  instagram?: string;

  primaryColor?: string;
  accentColor?: string;

  modoInterface?: ModoInterface;
}

class EmpresaService {
  async registerComUsuario(data: RegisterComUsuarioDTO) {
    const slug = await generateUniqueSlug(data.nomeEmpresa);
    const senhaHash = await bcrypt.hash(data.senha, 10);

    // D-18: o dia do cadastro é o dia 0, e `meiaNoiteEmSaoPaulo` devolve o limite
    // SUPERIOR EXCLUSIVO do dia local. Por isso o deslocamento carrega um dia extra
    // além de `DIAS_DE_TRIAL`: sem esse dia, quem se cadastrasse às 23:59 receberia 13
    // dias e um minuto em vez dos 14 dias completos prometidos por BILL-03.
    const agora = new Date();
    const trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1);

    try {
      return await prisma.$transaction(async (tx) => {
        // Os outros três fatos de billing ficam nos defaults do schema (nulo, nulo
        // e `false`) porque esse é exatamente o estado correto de uma empresa em
        // trial, e porque nenhum caminho de aplicação pode escrevê-los: BILL-04
        // (acesso vitalício só direto no banco), D-09 (a data de acesso pago é
        // escrita só pelo webhook de pagamento confirmado, Fase 3) e D-10 (a data
        // de cancelamento só por ação explícita do usuário, Fase 7).
        const empresa = await tx.empresa.create({
          data: {
            nome: data.nomeEmpresa,
            slug,
            modoInterface: data.modoInterface,
            trialFim,
            ultimoStatusAuditado: StatusAcesso.TRIAL,
          },
        });

        const usuario = await tx.usuario.create({
          data: {
            nome: data.nomeResponsavel,
            email: data.email,
            senhaHash,
            empresaId: empresa.id,
          },
        });

        // BILL-05: primeira entrada da trilha, na MESMA transação — se o registro
        // fizer rollback (ex.: P2002 de email duplicado), a linha de auditoria some
        // junto e a trilha não fica com fantasmas.
        //
        // Escrita direta com `tx.` em vez de `acessoService.registrarTransicao`:
        // aquele método opera sobre o `prisma` global, fora desta transação, e o
        // compare-and-swap dele não faz sentido aqui — a empresa acabou de nascer,
        // não há concorrência possível sobre ela.
        //
        // D-17: exatamente estas 4 chaves; a linha de auditoria não carrega
        // snapshot dos fatos de billing.
        await tx.auditoriaAcesso.create({
          data: {
            empresaId: empresa.id,
            statusAnterior: null,
            statusNovo: StatusAcesso.TRIAL,
            causa: CausaTransicaoAcesso.REGISTRO,
          },
        });

        return { empresa, usuario };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];

        if (target.includes("email")) {
          throw new HttpError("Este email já está em uso.", 409);
        }

        if (target.includes("slug")) {
          throw new HttpError(
            "Não foi possível gerar um identificador único para a empresa. Tente novamente.",
            409
          );
        }
      }

      throw error;
    }
  }

  async list() {
    return prisma.empresa.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        nome: "asc",
      },
    });
  }

  async findById(id: string) {
    return prisma.empresa.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        usuarios: {
          select: {
            id: true,
            nome: true,
            email: true,
            role: true,
            ativo: true,
          },
        },
        produtos: true,
        combos: true,
        promocoes: true,
      },
    });
  }

  async findBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        banner: true,
        descricao: true,
        telefone: true,
        instagram: true,
        primaryColor: true,
        accentColor: true,
      },
    });

    if (!empresa) {
      return null;
    }

    const [produtos, combos, promocoes] = await Promise.all([
      produtoService.listCatalogo(empresa.id),
      comboService.listCatalogo(empresa.id),
      promocaoService.listVigentesByEmpresa(empresa.id),
    ]);

    return {
      ...empresa,
      produtos,
      combos,
      promocoes,
    };
  }

  async findHeaderData(id: string) {
    return prisma.empresa.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        primaryColor: true,
        accentColor: true,
        modoInterface: true,
      },
    });
  }

  async findBranding(id: string) {
    return prisma.empresa.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        banner: true,
        descricao: true,
        telefone: true,
        instagram: true,
        primaryColor: true,
        accentColor: true,
        modoInterface: true,
      },
    });
  }

  async resolveIdBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    return empresa?.id ?? null;
  }

  async create(data: CreateEmpresaDTO) {
    return prisma.empresa.create({
      data: {
        nome: data.nome,
        slug: data.slug,

        logo: data.logo,
        banner: data.banner,
        descricao: data.descricao,

        telefone: data.telefone,
        instagram: data.instagram,

        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
      },
    });
  }

  // Allowlist explícito — NÃO simplificar para `data` cru.
  // `UpdateEmpresaDTO` é um tipo de compilação: ele é apagado no build e não filtra nada em runtime.
  // `app/api/empresas/[id]/route.ts` repassa o body cru do request (`await request.json()`) para cá,
  // e o check `id !== auth.empresaId` do route handler NÃO protege — o ataque é o ADMIN escrevendo
  // na própria empresa. Sem esta lista positiva, `acessoAte`, `trialFim`, `canceladoEm` e
  // `acessoVitalicio` seriam graváveis por HTTP e BILL-04 ("acesso vitalício só via banco, sem UI")
  // seria contornável por qualquer ADMIN autenticado.
  // Campo novo em `UpdateEmpresaDTO` só passa a ser gravável se for adicionado aqui de propósito.
  async update(id: string, data: UpdateEmpresaDTO) {
    const permitido: Prisma.EmpresaUpdateInput = {};

    if (data.nome !== undefined) permitido.nome = data.nome;
    if (data.slug !== undefined) permitido.slug = data.slug;

    if (data.logo !== undefined) permitido.logo = data.logo;
    if (data.banner !== undefined) permitido.banner = data.banner;
    if (data.descricao !== undefined) permitido.descricao = data.descricao;

    if (data.telefone !== undefined) permitido.telefone = data.telefone;
    if (data.instagram !== undefined) permitido.instagram = data.instagram;

    if (data.primaryColor !== undefined) permitido.primaryColor = data.primaryColor;
    if (data.accentColor !== undefined) permitido.accentColor = data.accentColor;

    if (data.modoInterface !== undefined) permitido.modoInterface = data.modoInterface;

    return prisma.empresa.update({
      where: {
        id,
      },
      data: permitido,
    });
  }

  async delete(id: string) {
    return prisma.empresa.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}

export const empresaService = new EmpresaService();