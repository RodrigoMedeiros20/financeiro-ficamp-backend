import { Router } from "express";
import { z } from "zod";
import { getAccessToken, exigeLogin } from "./auth";
import { lerContas, confirmarPagamentos } from "./planilha";
import { prisma } from "../db/prisma";

export const sharepointRouter = Router();

// LEITURA ao vivo da planilha
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

// CONFIRMAR: marca na planilha e grava as confirmadas no banco (histórico)
const alvo = z.object({
  rowReal: z.number().int().positive(),
  fp: z.string().min(1),
  movimentacao: z.string().optional(),
  valor: z.number().optional(),
  tabela: z.string().optional(),
  obrigatorio: z.boolean().optional(),
  meioPagamento: z.string().nullable().optional(),
  detalhe: z.string().nullable().optional(),
  vencimento: z.string().nullable().optional(),
  programada: z.string().nullable().optional(),
});
const corpo = z.object({ alvos: z.array(alvo).min(1) });

sharepointRouter.post("/confirmar", exigeLogin, async (req, res) => {
  try {
    const token = await getAccessToken(req);
    if (!token) return res.status(401).json({ erro: "precisa_login" });
    const { alvos } = corpo.parse(req.body);
    const r = await confirmarPagamentos(token, alvos);

    // grava no histórico apenas as que foram REALMENTE confirmadas (r.linhas)
    const ok = new Set<number>(r.linhas || []);
    const registros = alvos.filter((a) => ok.has(a.rowReal)).map((a) => ({
      rowReal: a.rowReal,
      movimentacao: a.movimentacao ?? "",
      valor: a.valor ?? 0,
      tabela: a.tabela ?? "Oficial",
      obrigatorio: a.obrigatorio ?? false,
      meioPagamento: a.meioPagamento ?? null,
      detalhe: a.detalhe ?? null,
      vencimento: a.vencimento ?? null,
      programada: a.programada ?? null,
    }));
    if (registros.length) {
      try { await prisma.pagamentoConfirmado.createMany({ data: registros }); }
      catch (e) { console.error("Falha ao gravar histórico de pagamentos:", e); }
    }

    res.json(r);
  } catch (e: any) {
    console.error("ERRO /confirmar:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// HISTÓRICO: lista as contas pagas dos últimos N dias (padrão 30)
sharepointRouter.get("/pagamentos", exigeLogin, async (req, res) => {
  try {
    const dias = Math.min(3650, Math.max(1, Number(req.query.dias) || 30));
    const desde = new Date(Date.now() - dias * 86400 * 1000);
    const itens = await prisma.pagamentoConfirmado.findMany({
      where: { confirmadoEm: { gte: desde } },
      orderBy: { confirmadoEm: "desc" },
    });
    res.json({ itens });
  } catch (e: any) {
    console.error("ERRO /pagamentos:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});