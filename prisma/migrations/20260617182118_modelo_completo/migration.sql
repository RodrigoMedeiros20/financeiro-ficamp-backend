-- CreateTable
CREATE TABLE "classificacao" (
    "natureza" TEXT NOT NULL,
    "fc" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "sub_grupo" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "centro_custos" TEXT,

    CONSTRAINT "classificacao_pkey" PRIMARY KEY ("natureza")
);

-- CreateTable
CREATE TABLE "mapa_descricao" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT,
    "descricao_movimentacao" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "centro_custos" TEXT,
    "observacao" TEXT,
    "natureza_anterior" TEXT,
    "centro_custos_anterior" TEXT,

    CONSTRAINT "mapa_descricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banco" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "banco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta_pagar" (
    "id" SERIAL NOT NULL,
    "tipificacao" TEXT NOT NULL DEFAULT 'Saída',
    "banco" TEXT,
    "movimentacao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "meio_pagamento" TEXT,
    "detalhe" TEXT,
    "competencia" TIMESTAMP(3),
    "vencimento" TIMESTAMP(3) NOT NULL,
    "data_programada" TIMESTAMP(3),
    "efetivacao" TIMESTAMP(3),
    "tabela" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "selecionado" BOOLEAN NOT NULL DEFAULT false,
    "natureza" TEXT NOT NULL,
    "centro_custos" TEXT,
    "seq" INTEGER,

    CONSTRAINT "conta_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta_receber" (
    "id" SERIAL NOT NULL,
    "movimentacao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "meio_pagamento" TEXT,
    "detalhe" TEXT,
    "centro_custos" TEXT,
    "competencia" TIMESTAMP(3),
    "vencimento" TIMESTAMP(3) NOT NULL,
    "efetivacao" TIMESTAMP(3),
    "banco" TEXT,
    "tabela" TEXT,
    "natureza" TEXT NOT NULL,
    "selecionado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "conta_receber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamento" (
    "id" SERIAL NOT NULL,
    "tipificacao" TEXT NOT NULL,
    "cliente_fornecedor" TEXT,
    "data_coleta" TIMESTAMP(3),
    "num_cheque" TEXT,
    "nome_cheque" TEXT,
    "banco" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "vencimento" TIMESTAMP(3),
    "liquidacao" TIMESTAMP(3),
    "observacao" TEXT,
    "natureza" TEXT NOT NULL,
    "inadimplencia" TEXT,

    CONSTRAINT "lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheque" (
    "id" SERIAL NOT NULL,
    "tipificacao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "lancamento" TEXT,
    "data" TIMESTAMP(3),
    "valor" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheque_devolvido" (
    "id" SERIAL NOT NULL,
    "banco" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "status" TEXT,
    "data" TIMESTAMP(3),

    CONSTRAINT "cheque_devolvido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimento_caixa" (
    "id" SERIAL NOT NULL,
    "entrada" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "lancamento" TEXT,
    "natureza" TEXT,
    "centro_custos" TEXT,
    "data" TIMESTAMP(3),
    "tipificacao" TEXT,

    CONSTRAINT "movimento_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_banco" (
    "id" SERIAL NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "banco" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "saldo_banco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_inicial" (
    "id" SERIAL NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "banco" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "saldo_inicial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "parametro_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "banco_nome_key" ON "banco"("nome");

-- CreateIndex
CREATE INDEX "conta_pagar_vencimento_idx" ON "conta_pagar"("vencimento");

-- CreateIndex
CREATE INDEX "conta_pagar_efetivacao_idx" ON "conta_pagar"("efetivacao");

-- CreateIndex
CREATE INDEX "conta_pagar_data_programada_idx" ON "conta_pagar"("data_programada");

-- CreateIndex
CREATE INDEX "lancamento_liquidacao_idx" ON "lancamento"("liquidacao");

-- CreateIndex
CREATE UNIQUE INDEX "saldo_banco_data_banco_key" ON "saldo_banco"("data", "banco");

-- CreateIndex
CREATE UNIQUE INDEX "saldo_inicial_data_banco_key" ON "saldo_inicial"("data", "banco");

-- AddForeignKey
ALTER TABLE "conta_pagar" ADD CONSTRAINT "conta_pagar_natureza_fkey" FOREIGN KEY ("natureza") REFERENCES "classificacao"("natureza") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_receber" ADD CONSTRAINT "conta_receber_natureza_fkey" FOREIGN KEY ("natureza") REFERENCES "classificacao"("natureza") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_natureza_fkey" FOREIGN KEY ("natureza") REFERENCES "classificacao"("natureza") ON DELETE RESTRICT ON UPDATE CASCADE;
