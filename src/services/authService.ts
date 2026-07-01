import { randomBytes } from "crypto";
import {
  findUsuarioByEmail,
  insertUsuario,
  insertSessao,
  findSessaoValidaPorToken,
  deleteSessaoPorToken
} from "../repository/authRepo";
import { isUniqueConstraintError } from "../utils/msSqlErrors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function diasParaExpiracaoSessao(): number {
  const n = Number(process.env.AUTH_SESSAO_DIAS ?? "30");
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export type RegisterInput = {
  email: string;
  senha: string;
  confirmar_senha: string;
};

export type RegisterOk = { id: string; email: string };

export async function registrarUsuario(input: RegisterInput): Promise<RegisterOk> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const senha = String(input.senha ?? "");
  const confirmar = String(input.confirmar_senha ?? "");

  if (!email || !EMAIL_RE.test(email)) {
    throw new Error("EMAIL_INVALIDO");
  }
  if (!senha) {
    throw new Error("SENHA_OBRIGATORIA");
  }
  if (senha !== confirmar) {
    throw new Error("SENHAS_DIFERENTES");
  }

  const existente = await findUsuarioByEmail(email);
  if (existente) {
    throw new Error("EMAIL_JA_CADASTRADO");
  }

  try {
    const id = await insertUsuario(email, senha);
    return { id, email };
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      throw new Error("EMAIL_JA_CADASTRADO");
    }
    throw e;
  }
}

export type LoginInput = {
  email: string;
  senha: string;
};

export type LoginOk = {
  access_token: string;
  token_type: "Bearer";
  expira_em: string;
  usuario: { email: string };
};

export async function login(input: LoginInput): Promise<LoginOk> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const senha = String(input.senha ?? "");

  if (!email || !senha) {
    throw new Error("CREDENCIAIS_INVALIDAS");
  }

  const usuario = await findUsuarioByEmail(email);
  if (!usuario || usuario.senha !== senha) {
    throw new Error("CREDENCIAIS_INVALIDAS");
  }

  const token = randomBytes(32).toString("hex");
  const expira = new Date();
  expira.setUTCDate(expira.getUTCDate() + diasParaExpiracaoSessao());

  await insertSessao(usuario.id, token, expira);

  return {
    access_token: token,
    token_type: "Bearer",
    expira_em: expira.toISOString(),
    usuario: { email: usuario.email }
  };
}

export async function logout(token: string): Promise<void> {
  const t = String(token ?? "").trim();
  if (!t) {
    throw new Error("TOKEN_OBRIGATORIO");
  }
  await deleteSessaoPorToken(t);
}

export async function validarToken(token: string) {
  const t = String(token ?? "").trim();
  if (!t) return null;
  return findSessaoValidaPorToken(t);
}
