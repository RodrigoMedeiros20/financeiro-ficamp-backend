// backend/src/graph/sharepointRoute.ts
import { Router } from "express";
import { z } from "zod";
import { getAccessToken, exigeLogin } from "./auth";
import { lerContas, confirmarPagamentos } from "./planilha";

export const sharepointRouter = Router();

sharepointRouter.get("/contas", exigeLogin, async (req, res) => {
  try {
    const token = await getAccessToken(req);
    if (!token) return res.status(401).json({ erro: "precisa_login" });
    const contas = await lerContas(token);
    res.json({ contas });
  } catch (e: any) {
    console.error("ERRO /contas:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

const corpo = z.object({
  alvos: z.array(z.object({
    rowReal: z.number().int().positive(),
    fp: z.string().min(1),
  })).min(1),
});

sharepointRouter.post("/confirmar", exigeLogin, async (req, res) => {
  try {
    const token = await getAccessToken(req);
    if (!token) return res.status(401).json({ erro: "precisa_login" });
    const { alvos } = corpo.parse(req.body);
    console.log("CONFIRMAR recebeu alvos:", JSON.stringify(alvos));
    const r = await confirmarPagamentos(token, alvos);
    console.log("CONFIRMAR resultado:", JSON.stringify(r));
    res.json(r);
  } catch (e: any) {
    console.error("ERRO /confirmar:", e);
    res.status(500).json({ error: e?.message || String(e), stack: e?.stack });
  }
});