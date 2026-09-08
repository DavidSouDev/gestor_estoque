import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { camposDaColisaoUnica } from "@/lib/prisma-error";
import {
  loginBloqueado,
  registrarFalhaDeLogin,
  limparTentativasDeLogin,
  loginBloqueadoPorIp,
  registrarFalhaDeLoginPorIp,
  limparTentativasDeLoginPorIp,
} from "@/lib/login-rate-limit";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

export interface CreateUsuarioDTO {
  nome: string;
  email: string;
  senha: string;
  empresaId: string;
}

export interface UpdateUsuarioDTO {
  nome?: string;
  email?: string;
  senha?: string;
  /**
   * Exigida quando `senha` está presente — confirma que quem está trocando a
   * senha É quem já a conhece, não só quem carrega um Bearer token/cookie de
   * sessão válido no momento. Sem isto, um token vazado (XSS, log, endpoint de
   * integração comprometido) bastava para sequestrar a conta silenciosamente:
   * trocar a senha sem nunca precisar da senha antiga.
   */
  senhaAtual?: string;
  ativo?: boolean;
}

/**
 * Hash de custo idêntico ao de um usuário real (`bcrypt.hash(..., 10)`),
 * computado UMA vez na carga do módulo — nunca comparado de verdade contra
 * nenhuma senha real. Existe só para `validatePassword` pagar o mesmo custo
 * de `bcrypt.compare` quando o email não existe (ver JSDoc do método).
 */
const HASH_FANTASMA = bcrypt.hashSync("nao-existe-comparacao-real", 10);

const SAFE_SELECT = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true,
  empresa: {
    select: {
      id: true,
      nome: true,
      slug: true,
    },
  },
} as const;

class UsuarioService {
  async list(empresaId: string) {
    return prisma.usuario.findMany({
      where: { empresaId },
      select: SAFE_SELECT,
      orderBy: {
        nome: "asc",
      },
    });
  }

  async findById(id: string) {
    return prisma.usuario.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
  }

  async findByEmail(email: string) {
    return prisma.usuario.findUnique({
      where: { email },
    });
  }

  async create(data: CreateUsuarioDTO) {
    const empresaJaTemAdmin = await prisma.usuario.findUnique({
      where: { empresaId: data.empresaId },
      select: { id: true },
    });

    if (empresaJaTemAdmin) {
      throw new HttpError("Esta empresa já possui um administrador cadastrado.", 409);
    }

    const senhaHash = await bcrypt.hash(data.senha, 10);

    try {
      return await prisma.usuario.create({
        data: {
          nome: data.nome,
          email: data.email,
          senhaHash,
          empresaId: data.empresaId,
        },
        select: SAFE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // A extração mora em `lib/prisma-error.ts` porque o `meta` deste erro,
        // com driver adapter, NÃO carrega `target` — ler `meta.target` aqui
        // fazia todo P2002 escapar como erro cru, apagando a distinção entre
        // colisão de `empresaId` e de `email`. Ver o JSDoc do helper.
        const campos = camposDaColisaoUnica(error);

        if (campos.includes("empresaId")) {
          throw new HttpError("Esta empresa já possui um administrador cadastrado.", 409);
        }

        if (campos.includes("email")) {
          throw new HttpError("Este email já está em uso.", 409);
        }
      }

      throw error;
    }
  }

  async update(id: string, data: UpdateUsuarioDTO) {
    const updateData: Prisma.UsuarioUpdateInput = {
      nome: data.nome,
      email: data.email,
      ativo: data.ativo,
    };

    if (data.senha) {
      const atual = await prisma.usuario.findUnique({
        where: { id },
        select: { senhaHash: true },
      });

      if (!atual) {
        throw new HttpError("Usuário não encontrado.", 404);
      }

      // Mesmo `bcrypt.compare` de `validatePassword`, sem hash fantasma aqui:
      // não há oráculo de enumeração a proteger — quem chama já sabe que a
      // conta existe (é a própria, autenticada). `senhaAtual ?? ""` garante que
      // uma troca de senha sem o campo (ou com string vazia) nunca confere.
      const senhaAtualConfere = await bcrypt.compare(data.senhaAtual ?? "", atual.senhaHash);

      if (!senhaAtualConfere) {
        throw new HttpError("Senha atual incorreta.", 403);
      }

      updateData.senhaHash = await bcrypt.hash(data.senha, 10);
    }

    return prisma.usuario.update({
      where: { id },
      data: updateData,
      select: SAFE_SELECT,
    });
  }

  async delete(id: string) {
    return prisma.usuario.update({
      where: { id },
      data: {
        ativo: false,
      },
      select: SAFE_SELECT,
    });
  }

  /**
   * `ip` é opcional (chamadores fora de um request HTTP, como scripts,
   * legitimamente não têm um) e alimenta um SEGUNDO freio, independente do de
   * email — ver JSDoc de `lib/login-rate-limit.ts` para o motivo dos dois
   * existirem (o de email sozinho não pega "password spraying": 1 tentativa
   * por email, milhares de emails, nunca bate o limite por conta).
   */
  async validatePassword(email: string, senha: string, ip?: string) {
    // Freios de força bruta ANTES de tocar o banco: um email OU IP bloqueado
    // nem paga a query. A chave do freio por email é o email informado, exista
    // ele ou não (ver JSDoc de `lib/login-rate-limit.ts`) — nunca dá pra saber
    // "existe" antes desta checagem. Os dois freios são consultados em
    // paralelo (`Promise.all`, não sequencial) — não há dependência entre
    // eles, e cada um já é uma chamada de rede ao Redis.
    const [bloqueadoPorEmail, bloqueadoPorIp] = await Promise.all([
      loginBloqueado(email),
      ip !== undefined ? loginBloqueadoPorIp(ip) : Promise.resolve(false),
    ]);

    if (bloqueadoPorEmail || bloqueadoPorIp) {
      throw new HttpError("Muitas tentativas de login. Tente novamente em alguns minutos.", 429);
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: {
        empresa: true,
      },
    });

    // `bcrypt.compare` roda SEMPRE, exista ou não o usuário — contra o hash
    // real quando existe, contra `HASH_FANTASMA` quando não. Um `return null`
    // antecipado no caminho "não existe" pouparia o custo do bcrypt (~dezenas
    // de ms) e o tempo de resposta viraria um oráculo: um atacante mediria
    // esse atraso para descobrir quais emails estão cadastrados, mesmo com a
    // mensagem de erro sendo idêntica nos dois casos.
    const senhaValida = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_FANTASMA);

    if (!usuario || !senhaValida) {
      await Promise.all([
        registrarFalhaDeLogin(email),
        ip !== undefined ? registrarFalhaDeLoginPorIp(ip) : Promise.resolve(),
      ]);

      return null;
    }

    await Promise.all([
      limparTentativasDeLogin(email),
      ip !== undefined ? limparTentativasDeLoginPorIp(ip) : Promise.resolve(),
    ]);

    return usuario;
  }
}

export const usuarioService = new UsuarioService();