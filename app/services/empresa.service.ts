import { prisma } from "@/lib/prisma";
import { produtoService } from "./produto.service";
import { comboService } from "./combo.service";
import { promocaoService } from "./promocao.service";
import { generateUniqueSlug } from "@/lib/slug";
import { slugify } from "@/lib/slugify";
import { HttpError } from "@/lib/http-error";
import { CausaTransicaoAcesso, ModoInterface, Prisma, StatusAcesso } from "@prisma/client";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import { DIAS_DE_TRIAL } from "@/lib/avaliar-acesso";
import { EMPRESA_PUBLICAVEL_SELECT, empresaPodePublicar } from "@/lib/empresa-publicavel";
import { termoVigente } from "@/lib/termo-vigente";
import { camposDaColisaoUnica } from "@/lib/prisma-error";
import bcrypt from "bcryptjs";

export interface RegisterComUsuarioDTO {
  nomeEmpresa: string;
  nomeResponsavel: string;
  email: string;
  senha: string;
  modoInterface: ModoInterface;

  /**
   * CPF ou CNPJ, já normalizado (só dígitos) e validado pela Server Action
   * (`documentoValido` em `lib/cpf-cnpj.ts`). Obrigatório e único no banco
   * (`Empresa.cpfCnpj`) — é o que impede a mesma pessoa/empresa real de gerar
   * trials infinitos criando contas novas com e-mails diferentes.
   */
  cpfCnpj: string;

  // Coletados no próprio formulário de cadastro, opcionais (mesma regra de
  // "Minha Loja"): quem não preenche agora continua podendo preencher depois
  // em `marca/actions.ts`. `logo` NÃO entra aqui de propósito — o upload
  // precisa do `empresaId`, que só existe depois deste `create`; ver o
  // follow-up em `app/registro/actions.ts`.
  telefone?: string;
  instagram?: string;

  /**
   * TERM-01. O id da versão dos termos que o usuário VIU no formulário — não o
   * que o servidor descobriria sozinho.
   *
   * Obrigatório, nunca opcional: o campo existe precisamente para que a
   * comparação de TOCTOU seja possível (Pitfall 4). Torná-lo opcional
   * devolveria ao chamador a opção de omitir o aceite, que é o que TERM-01
   * proíbe.
   */
  termoAceitoId: string;
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

  logo?: string | null;
  banner?: string;
  descricao?: string;

  telefone?: string;
  instagram?: string;

  primaryColor?: string;
  accentColor?: string;

  modoInterface?: ModoInterface;
}

/**
 * Segmentos de topo já ocupados por rotas ESTÁTICAS de `app/` (`app/api`,
 * `app/docs`, `app/registro`). Next.js sempre prioriza a rota estática sobre
 * `app/[slug]`, então uma empresa com um destes slugs fica permanentemente
 * inacessível pelo próprio path — ela existe no banco, mas `/api`, `/docs` e
 * `/registro` nunca chegam ao `[slug]` dinâmico para resolvê-la.
 */
const SLUGS_RESERVADOS = new Set(["api", "docs", "registro"]);

/**
 * Branding público + os 4 fatos de billing na MESMA projeção, de propósito: é o
 * que permite decidir `bloqueada` sem uma segunda query (T-04-02). Os fatos
 * crus nunca saem do service — `findBrandingBySlug` os consome e devolve apenas
 * o booleano derivado.
 */
const EMPRESA_BRANDING_PUBLICO_SELECT = {
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

  acessoAte: true,
  trialFim: true,
  canceladoEm: true,
  acessoVitalicio: true,
} as const;

class EmpresaService {
  async registerComUsuario(data: RegisterComUsuarioDTO) {
    const slug = await generateUniqueSlug(data.nomeEmpresa);
    const senhaHash = await bcrypt.hash(data.senha, 10);
    // I/O de LEITURA fora da transação interativa, junto das duas linhas acima:
    // é a mesma disciplina de pool que o JSDoc de `aplicar()` em
    // `app/api/cron/reconciliacao-diaria/route.ts` documenta.
    const termo = await termoVigente();

    // TERM-01 — o registro falha FECHADO, e o gate de TERM-04 (`lib/auth-guard.ts`
    // / `lib/session.ts`) falha ABERTO com este MESMO `null`. A assimetria é
    // deliberada, não uma incoerência a ser "harmonizada":
    //
    // - Aqui, a falha atinge UM cadastro, e criar conta sem aceite viola TERM-01
    //   diretamente — não há desfecho seguro que não seja recusar.
    // - Lá, gatear contra um documento inexistente derrubaria TODOS os tenants de
    //   uma vez, e a recuperação dependeria de alguém conseguir logar para
    //   publicar o termo.
    //
    // Os dois lados estão comentados de propósito (o outro está no ponto 2 do
    // JSDoc de `lib/termo-vigente.ts`) para que ninguém "corrija" um deles para
    // casar com o outro.
    //
    // Na prática esta guarda é INALCANÇÁVEL em qualquer ambiente que tenha rodado
    // a migration de seed da v1 (plano 06-01) — inclusive a CI, que roda
    // `prisma migrate deploy` e nada mais. Ela existe como backstop para um banco
    // em estado inesperado, não como fluxo esperado.
    //
    // A mensagem é a copy E4 da UI-SPEC, genérica de propósito: a causa real
    // ("nenhum termo publicado") é detalhe de servidor e não vaza para o cliente
    // (CLAUDE.md § Error Handling).
    if (!termo) {
      console.error(
        "[registro] nenhuma versão de Termos de Uso publicada — cadastro recusado (fail-closed, TERM-01)"
      );

      throw new HttpError(
        "Não foi possível abrir o cadastro agora. Tente novamente em alguns instantes.",
        503
      );
    }

    // Pitfall 4 (TOCTOU). O usuário abre `/registro`, lê a v3, e enquanto preenche
    // o formulário o SUPERADMIN publica a v4. Resolver "a vigente" no momento do
    // submit gravaria um aceite da v4 contra alguém que leu a v3, destruindo a
    // única propriedade que justifica a existência da tabela de aceites.
    //
    // `data.termoAceitoId` é dado CONTROLADO PELO CLIENTE: a checagem é
    // IGUALDADE contra o vigente do servidor, nunca "usa o que veio" — e o valor
    // gravado abaixo é sempre `termo.id`.
    //
    // Copy E2 da UI-SPEC, literal: a Server Action a devolve ao formulário sem
    // reescrever, e a re-renderização mostra o texto novo (a UI-SPEC exige as
    // duas metades juntas).
    if (data.termoAceitoId !== termo.id) {
      throw new HttpError(
        "Os termos foram atualizados. Leia a nova versão e aceite novamente para criar sua conta.",
        409
      );
    }

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

            telefone: data.telefone,
            instagram: data.instagram,
            cpfCnpj: data.cpfCnpj,

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
            // TERM-01: o bookkeeping de aceite nasce preenchido, o que torna o
            // `usuario.update` de `termoService.registrarAceite` desnecessário
            // aqui — ver o comentário da quarta escrita, abaixo.
            termoAceitoId: termo.id,
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

        // TERM-01: o fato do aceite, quarta escrita da MESMA transação. Se o
        // registro fizer rollback (ex.: P2002 de email duplicado), o aceite some
        // junto e não fica fantasma na tabela de fatos — pelo mesmo argumento já
        // escrito acima para a linha de auditoria.
        //
        // Escrita direta com `tx.` em vez de `termoService.registrarAceite`:
        // aquele método opera sobre o `prisma` global, FORA desta transação (o
        // aceite escapararia do rollback), e faz um `usuario.update` de
        // bookkeeping que aqui é redundante — o `usuario.create` acima já nasce
        // com `termoAceitoId` preenchido. É o mesmo raciocínio já registrado
        // logo acima para `acessoService.registrarTransicao`.
        await tx.aceiteTermo.create({
          data: {
            usuarioId: usuario.id,
            termoId: termo.id,
          },
        });

        return { empresa, usuario };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // A extração mora em `lib/prisma-error.ts` porque o `meta` deste erro,
        // com driver adapter, NÃO carrega `target` — ler `meta.target` aqui
        // fazia todo P2002 escapar como erro cru e virar a mensagem genérica de
        // falha no cadastro. Ver o JSDoc do helper para o caminho real.
        const campos = camposDaColisaoUnica(error);

        if (campos.includes("email")) {
          throw new HttpError("Este email já está em uso.", 409);
        }

        if (campos.includes("cpfCnpj")) {
          throw new HttpError("Este CPF/CNPJ já possui uma conta cadastrada.", 409);
        }

        if (campos.includes("slug")) {
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

  /**
   * ACC-03. Devolve `null` para "não existe", "removida por soft delete" E
   * "bloqueada" — os três indistinguíveis por construção.
   *
   * O gate mora logo depois do `if (!empresa)` e ANTES do `Promise.all`: é isso
   * que compra a paridade de CUSTO com o caso "slug inexistente" (1 query em
   * qualquer desfecho de rejeição). Movê-lo para depois do fan-out reabriria o
   * canal lateral de tempo de T-04-02, mesmo com a resposta idêntica.
   *
   * Os 4 fatos de billing entram no `select` mas são desestruturados para FORA
   * do objeto devolvido: o corpo de `GET /api/empresas/slug/[slug]` é público, e
   * datas de billing ali seriam uma divulgação de informação nova (T-04-01).
   */
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

        acessoAte: true,
        trialFim: true,
        canceladoEm: true,
        acessoVitalicio: true,
      },
    });

    if (!empresa) {
      return null;
    }

    if (!empresaPodePublicar(empresa, new Date())) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { acessoAte, trialFim, canceladoEm, acessoVitalicio, ...publico } = empresa;

    const [produtos, combos, promocoes] = await Promise.all([
      produtoService.listCatalogo(publico.id),
      comboService.listCatalogo(publico.id),
      promocaoService.listVigentesByEmpresa(publico.id),
    ]);

    return {
      ...publico,
      produtos,
      combos,
      promocoes,
    };
  }

  /**
   * ACC-03 / D-07. Funil ÚNICO de resolução de tenant para os caminhos públicos
   * do catálogo.
   *
   * Devolve `null` para "não existe", "removida por soft delete" E "bloqueada",
   * gastando exatamente UMA ida ao banco em todos os desfechos — a paridade de
   * número de queries é parte da mitigação, não um detalhe de performance
   * (T-04-01 / T-04-02).
   *
   * Só o `id` sai daqui: nenhum fato de billing atravessa o funil.
   */
  async findPublicavelBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: EMPRESA_PUBLICAVEL_SELECT,
    });

    // Uma condição só, de propósito: "não existe / removida" e "bloqueada"
    // convergem textualmente no MESMO retorno, sem caminho separado que alguém
    // possa mais tarde instrumentar, logar ou responder de forma diferente.
    if (!empresa || !empresaPodePublicar(empresa, new Date())) {
      return null;
    }

    return { id: empresa.id };
  }

  /**
   * Mesma garantia de `findPublicavelBySlug`, resolvendo por id — é o que o
   * caminho `?empresaId=` do catálogo precisa para que "empresaId inexistente" e
   * "empresaId bloqueado" custem o mesmo round trip.
   */
  async findPublicavelById(empresaId: string) {
    const empresa = await prisma.empresa.findFirst({
      where: {
        id: empresaId,
        deletedAt: null,
      },
      select: EMPRESA_PUBLICAVEL_SELECT,
    });

    // Mesma condição única de `findPublicavelBySlug` — ver justificativa lá.
    if (!empresa || !empresaPodePublicar(empresa, new Date())) {
      return null;
    }

    return { id: empresa.id };
  }

  /**
   * D-09. Leitura DELIBERADAMENTE não gateada por status.
   *
   * Uma empresa bloqueada continua respondendo aqui, com `bloqueada: true`. Isso
   * não é um esquecimento: a tela de login do admin se alimenta desta leitura, e
   * se ela devolvesse 404 o cliente bloqueado não conseguiria entrar para pagar
   * — o objetivo da fase se inverteria (04-RESEARCH.md, Achado crítico 2).
   *
   * Devolve APENAS branding e o booleano derivado. Nunca produtos, combos ou
   * promoções — quem quer catálogo usa `findBySlug`/`findPublicavelBySlug`, que
   * são gateados. Os 4 fatos de billing são consumidos aqui dentro e não saem no
   * retorno (T-04-01).
   *
   * O vazamento residual (existe vs. não existe) é reduzido no plano 04-04, que
   * renderiza branding genérico quando `bloqueada === true` (T-04-12).
   */
  async findBrandingBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: EMPRESA_BRANDING_PUBLICO_SELECT,
    });

    if (!empresa) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { acessoAte, trialFim, canceladoEm, acessoVitalicio, ...branding } = empresa;

    return {
      ...branding,
      bloqueada: !empresaPodePublicar(empresa, new Date()),
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

  // T-04-03. Aqui existia um resolvedor slug→id SEM gate de status, removido pelo
  // plano 04-03 junto do seu último consumidor. Não reintroduza: um resolvedor de
  // tenant que ignora billing é exatamente o mecanismo que produziu seis portas
  // públicas de leitura, e mantê-lo disponível convida o sétimo caminho a nascer
  // inseguro. Quem precisa de id a partir de slug usa `findPublicavelBySlug`.

  // CR-01: mesmo cálculo de trial de `registerComUsuario` — sem isso a Empresa
  // nasce com os 4 fatos de billing nulos e `avaliarAcesso` a bloqueia para
  // sempre (fail-closed), violando INV-1 ("nenhuma empresa ativa pode ficar
  // sem trialFim", prisma/checks/backfill-billing.sql).
  async create(data: CreateEmpresaDTO) {
    const agora = new Date();
    const trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1);

    return prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
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

          trialFim,
          ultimoStatusAuditado: StatusAcesso.TRIAL,
        },
      });

      // BILL-05: primeira entrada da trilha, na mesma transação da criação —
      // ver justificativa completa em `registerComUsuario`, acima.
      await tx.auditoriaAcesso.create({
        data: {
          empresaId: empresa.id,
          statusAnterior: null,
          statusNovo: StatusAcesso.TRIAL,
          causa: CausaTransicaoAcesso.REGISTRO,
        },
      });

      return empresa;
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

    // `slugify` faz o MESMO tratamento do cadastro (minúsculas, sem acento,
    // só `[a-z0-9-]`, nunca string vazia) — sem isto, `PATCH /api/empresas/[id]`
    // aceitava `slug` cru do body: string vazia, unicode, ou colidindo com uma
    // rota estática de `app/` (ver `SLUGS_RESERVADOS`), quebrando o próprio
    // roteamento da empresa. A unicidade contra OUTRO tenant já é garantida
    // pela constraint `@unique` do banco — este bloco cobre o que ela não cobre.
    if (data.slug !== undefined) {
      const slug = slugify(data.slug);

      if (SLUGS_RESERVADOS.has(slug)) {
        throw new HttpError("Este slug é reservado e não pode ser usado.", 409);
      }

      permitido.slug = slug;
    }

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