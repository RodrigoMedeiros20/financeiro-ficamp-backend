// backend/src/graph/auth.ts
// Login Microsoft (modelo DELEGADO) com @azure/msal-node.
// Fluxo: /api/auth/login -> Microsoft -> /api/auth/callback -> sessão.
import { Router } from "express";
import { ConfidentialClientApplication, Configuration } from "@azure/msal-node";

const TENANT = process.env.MS_TENANT_ID!;
const CLIENT_ID = process.env.MS_CLIENT_ID!;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET!;
const REDIRECT_URI = process.env.MS_REDIRECT_URI!;
const APP_URL = process.env.APP_URL || "http://localhost:3000/contas-a-pagar";

// Permissão ESTREITA (só o OneDrive do próprio usuário) — aprovável sem admin.
export const SCOPES = ["User.Read", "Files.ReadWrite", "offline_access"];

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT}`,
    clientSecret: CLIENT_SECRET,
  },
};
const cca = new ConfidentialClientApplication(msalConfig);

export const authRouter = Router();

authRouter.get("/login", async (req, res, next) => {
  try {
    const url = await cca.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      prompt: "consent", // mostra a tela de consentimento limpa
    });
    res.redirect(url);
  } catch (e) { next(e); }
});

authRouter.get("/callback", async (req, res, next) => {
  try {
    const code = String(req.query.code || "");
    if (!code) return res.status(400).send("Faltou o code do login.");
    const result = await cca.acquireTokenByCode({ code, scopes: SCOPES, redirectUri: REDIRECT_URI });
    (req.session as any).account = result.account;
    (req.session as any).accessToken = result.accessToken;
    (req.session as any).expiresOn = result.expiresOn;
    res.redirect(APP_URL);
  } catch (e) { next(e); }
});

authRouter.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect(APP_URL));
});

// status de login para o front
authRouter.get("/me", (req: any, res) => {
  const acc = req.session?.account;
  if (!acc) return res.json({ logado: false });
  res.json({ logado: true, nome: acc.name ?? acc.username ?? "Usuário", email: acc.username ?? null });
});

// devolve accessToken válido (renova silenciosamente se preciso)
export async function getAccessToken(req: any): Promise<string | null> {
  const account = req.session?.account;
  if (!account) return null;
  const exp = req.session.expiresOn ? new Date(req.session.expiresOn).getTime() : 0;
  if (req.session.accessToken && exp - Date.now() > 120000) return req.session.accessToken;
  try {
    const result = await cca.acquireTokenSilent({ account, scopes: SCOPES });
    if (result) {
      req.session.accessToken = result.accessToken;
      req.session.expiresOn = result.expiresOn;
      return result.accessToken;
    }
  } catch {}
  return null;
}

export function exigeLogin(req: any, res: any, next: any) {
  if (!req.session?.account) return res.status(401).json({ erro: "precisa_login" });
  next();
}