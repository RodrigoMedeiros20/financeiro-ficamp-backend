import express from "express";
import cors from "cors";
import { contasPagarRouter } from "./routes/contasPagar";
import { saldoRouter } from "./routes/saldo";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());
app.use("/saldo", saldoRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/contas-pagar", contasPagarRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Erro interno" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API FICAMP em http://localhost:${port}`));
