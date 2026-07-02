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
    entregue BIT NOT NULL CONSTRAINT DF_ESCALA_chat_mensagens_entregue DEFAULT 0,
    lida BIT NOT NULL CONSTRAINT DF_ESCALA_chat_mensagens_lida DEFAULT 0,
    datahora_entrega DATETIME2 NULL,
    datahora_leitura DATETIME2 NULL,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_ESCALA_chat_mensagens_criado DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ESCALA_chat_mensagens_ordem FOREIGN KEY (id_ordemservico) REFERENCES dbo.ESCALA_ordemservico(id_ordemservico),
    CONSTRAINT FK_ESCALA_chat_mensagens_funcionario FOREIGN KEY (id_funcionario) REFERENCES dbo.t2_funcionarios(ID_FUNCIONARIO)
  );
  CREATE INDEX IX_ESCALA_chat_mensagens_ordem_funcionario ON dbo.ESCALA_chat_mensagens(id_ordemservico, id_funcionario);
END;

-- 5. Coluna de consentimento de compartilhamento de GPS em dbo.t2_funcionarios
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 't2_funcionarios' AND COLUMN_NAME = 'compartilha_gps'
)
BEGIN
  ALTER TABLE dbo.t2_funcionarios ADD compartilha_gps BIT NOT NULL CONSTRAINT DF_t2_funcionarios_compartilha_gps DEFAULT 1;
END;

-- 6. Tabela e colunas de Ponto de Encontro por Filial
IF OBJECT_ID(N'dbo.ESCALA_pontos_encontro', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ESCALA_pontos_encontro (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ESCALA_pontos_encontro PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    id_filial INT NOT NULL,
    nome NVARCHAR(150) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    raio_tolerancia_metros INT NOT NULL CONSTRAINT DF_ESCALA_pontos_encontro_raio DEFAULT 100,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_ESCALA_pontos_encontro_criado DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ESCALA_pontos_encontro_filial ON dbo.ESCALA_pontos_encontro(id_filial);
END;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'usar_ponto_encontro'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ADD usar_ponto_encontro BIT NOT NULL CONSTRAINT DF_ESCALA_ordemservico_usar_ponto DEFAULT 0;
END;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'id_ponto_encontro'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ADD id_ponto_encontro UNIQUEIDENTIFIER NULL;
  ALTER TABLE dbo.ESCALA_ordemservico ADD CONSTRAINT FK_ESCALA_ordemservico_ponto FOREIGN KEY (id_ponto_encontro) REFERENCES dbo.ESCALA_pontos_encontro(id);
END;

-- 6. Corrigir tamanho de tipo_completamento_ultimo para evitar truncamento na escala automática
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'ESCALA_ordemservico' AND COLUMN_NAME = 'tipo_completamento_ultimo'
)
BEGIN
  ALTER TABLE dbo.ESCALA_ordemservico ALTER COLUMN tipo_completamento_ultimo VARCHAR(100) NULL;
END;


