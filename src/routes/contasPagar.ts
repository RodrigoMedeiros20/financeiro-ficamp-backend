import { Router } from "express";
import { z } from "zod";
import { listarContasPagar, darBaixa, FiltroContas } from "../db/contasRepo";
import { simularPagamento } from "../domain/rules";
import { Tabela } from "../domain/types";

export const contasPagarRouter = Router();

/** GET /contas-pagar — lista com filtros (tabela, obrigatorio, apenasAPagar, de, ate). */
contasPagarRouter.get("/", async (req, res, next) => {
  try {
    const f: FiltroContas = {
      tabela: req.query.tabela as Tabela | undefined,
      obrigatorio: req.query.obrigatorio === undefined ? undefined : req.query.obrigatorio === "true",
      apenasAPagar: req.query.apenasAPagar === "true",
      de: req.query.de as string | undefined,
      ate: req.query.ate as string | undefined,
    };
    res.json(await listarContasPagar(f));
  } catch (e) { next(e); }
});

/** POST /contas-pagar/simular — totais + saldo após (não grava). */
const simSchema = z.object({
  selecionados: z.array(z.number().int()),
  saldoDisponivel: z.number(),
  de: z.string().optional(),
  ate: z.string().optional(),
});
contasPagarRouter.post("/simular", async (req, res, next) => {
  try {
    const { selecionados, saldoDisponivel, de, ate } = simSchema.parse(req.body);
    const contas = await listarContasPagar({ apenasAPagar: true, de, ate });
    res.json(simularPagamento(contas, { selecionados, saldoDisponivel }));
  } catch (e) { next(e); }
});

/** POST /contas-pagar/:id/baixa — confirma pagamento. */
const baixaSchema = z.object({ dataEfetivacao: z.string() });
contasPagarRouter.post("/:id/baixa", async (req, res, next) => {
  try {
    const { dataEfetivacao } = baixaSchema.parse(req.body);
    res.json(await darBaixa(Number(req.params.id), dataEfetivacao));
  } catch (e) { next(e); }
});
