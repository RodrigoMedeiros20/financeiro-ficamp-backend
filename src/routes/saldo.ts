import { Router } from "express";
import { prisma } from "../db/prisma";

export const saldoRouter = Router();

saldoRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.saldoBanco.findMany({ orderBy: { data: "desc" } });
    const ultimoPorBanco = new Map<string, number>();
    for (const r of rows) if (!ultimoPorBanco.has(r.banco)) ultimoPorBanco.set(r.banco, Number(r.valor));
    const porBanco = [...ultimoPorBanco.entries()].map(([banco, valor]) => ({ banco, valor }));
    const total = porBanco.reduce((s, b) => s + b.valor, 0);
    res.json({ total, porBanco });
  } catch (e) { next(e); }
});