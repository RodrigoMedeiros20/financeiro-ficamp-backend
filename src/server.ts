import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { authRouter } from "./graph/auth";
import { contasPagarRouter } from "./routes/contasPagar";
import { sharepointRouter } from "./graph/sharepointRoute";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

const PgStore = connectPgSimple(session);
const emProducao = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);
app.use(session({
  secret: process.env.SESSION_SECRET || "dev",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,                    // true em prod, false em local
    sameSite: "none", // none em prod, lax em local
  },
  store: new PgStore({
    conString: process.env.DATABASE_URL
  })
}));

app.use("/api/auth", authRouter);
app.use("/api/sharepoint", sharepointRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/contas-pagar", contasPagarRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Erro interno" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API FICAMP em http://localhost:${port}`));
