-- Script de atualização de banco de dados para a Versão 2 do Ecossistema Datasite (Idempotente)

-- 1. Colunas adicionais em dbo.ESCALA_ordemservico
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'verificar_OS'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ADD verificar_OS BIT NOT NULL CONSTRAINT DF_ESCALA_ordemservico_verificar_OS DEFAULT 1;
END;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'OS_nova'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ADD OS_nova BIT NOT NULL CONSTRAINT DF_ESCALA_ordemservico_OS_nova DEFAULT 1;
END;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'latitude'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ADD latitude DECIMAL(9,6) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'longitude'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ADD longitude DECIMAL(9,6) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'raio_tolerancia_metros'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ADD raio_tolerancia_metros INT NOT NULL CONSTRAINT DF_ESCALA_ordemservico_raio DEFAULT 100;
END;


-- 2. Colunas adicionais em dbo.t2_funcionarios
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 't2_funcionarios' AND COLUMN_NAME = 'bloqueado_ate'
)
BEGIN
  ALTER TABLE dbo.t2_funcionarios ADD bloqueado_ate DATETIME2 NULL;
END;


-- 3. Tabela de Logs de Penalidades/Bloqueio de No-Show
IF OBJECT_ID(N'dbo.ESCALA_penalidades_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ESCALA_penalidades_logs (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ESCALA_penalidades_logs PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    id_funcionario INT NOT NULL,
    data_falta DATETIME2 NULL,
    dias_suspensao INT NOT NULL,
    bloqueado_ate DATETIME2 NOT NULL,
    justificativa NVARCHAR(MAX) NULL,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_ESCALA_penalidades_logs_criado DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ESCALA_penalidades_logs_funcionario FOREIGN KEY (id_funcionario) REFERENCES dbo.t2_funcionarios(ID_FUNCIONARIO)
  );
  CREATE INDEX IX_ESCALA_penalidades_logs_funcionario ON dbo.ESCALA_penalidades_logs(id_funcionario);
END;


-- 4. Tabela de Persistência do Chat em Tempo Real
IF OBJECT_ID(N'dbo.ESCALA_chat_mensagens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ESCALA_chat_mensagens (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ESCALA_chat_mensagens PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    id_ordemservico INT NOT NULL,
    id_funcionario INT NOT NULL,
    remetente VARCHAR(50) NOT NULL, -- 'gestor' ou 'colaborador'
    mensagem NVARCHAR(MAX) NOT NULL,
    lida BIT NOT NULL CONSTRAINT DF_ESCALA_chat_mensagens_lida DEFAULT 0,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_ESCALA_chat_mensagens_criado DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ESCALA_chat_mensagens_ordem FOREIGN KEY (id_ordemservico) REFERENCES dbo.ESCALA_ordemservico(id_ordemservico),
    CONSTRAINT FK_ESCALA_chat_mensagens_funcionario FOREIGN KEY (id_funcionario) REFERENCES dbo.t2_funcionarios(ID_FUNCIONARIO)
  );
  CREATE INDEX IX_ESCALA_chat_mensagens_ordem_funcionario ON dbo.ESCALA_chat_mensagens(id_ordemservico, id_funcionario);
END;
