-- Tabelas esperadas pela API (Azure SQL / SQL_DATABASE). Idempotente: só cria se não existir.
IF OBJECT_ID(N'dbo.ESCALA_api_usuario', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ESCALA_api_usuario (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ESCALA_api_usuario PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    email NVARCHAR(255) NOT NULL,
    senha NVARCHAR(4000) NOT NULL,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_ESCALA_api_usuario_criado_em DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ESCALA_api_usuario_email UNIQUE (email)
  );
END;

IF OBJECT_ID(N'dbo.ESCALA_api_sessao', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ESCALA_api_sessao (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ESCALA_api_sessao PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    id_usuario UNIQUEIDENTIFIER NOT NULL,
    token NVARCHAR(64) NOT NULL,
    expira_em DATETIME2 NOT NULL,
    CONSTRAINT UQ_ESCALA_api_sessao_token UNIQUE (token),
    CONSTRAINT FK_ESCALA_api_sessao_usuario FOREIGN KEY (id_usuario)
      REFERENCES dbo.ESCALA_api_usuario (id)
  );
  CREATE INDEX IX_ESCALA_api_sessao_token ON dbo.ESCALA_api_sessao (token);
END;
