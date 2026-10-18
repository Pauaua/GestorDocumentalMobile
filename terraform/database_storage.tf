# -----------------------------------------------------------------------------
# Datos:
#   Amazon RDS PostgreSQL Multi-AZ en subredes aisladas (metadatos de documentos)
#   Secretos y configuración en SSM Parameter Store
#   Amazon S3: bucket privado de documentos + bucket de artefactos de despliegue
# -----------------------------------------------------------------------------

# ============================== RDS ==========================================
resource "aws_db_subnet_group" "main" {
  name        = "${local.name}-db-subnets"
  description = "Subredes aisladas (sin ruta a internet) para RDS"
  subnet_ids  = aws_subnet.isolated[*].id

  tags = { Name = "${local.name}-db-subnets" }
}

resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${local.name}-pg-"
  family      = "postgres${split(".", var.db_engine_version)[0]}"
  description = "Parametros PostgreSQL del gestor documental"

  # Conexiones solo con TLS.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Registra consultas lentas (> 1 s) para diagnóstico.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Contraseña sin caracteres que rompan la URL de conexión.
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "-_"
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name}-postgres"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  # Alta disponibilidad: standby síncrono en la otra AZ con failover automático.
  multi_az               = var.db_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  parameter_group_name   = aws_db_parameter_group.postgres.name

  backup_retention_period  = var.db_backup_retention_days
  backup_window            = "06:00-07:00" # 02:00-03:00 hora de Chile (UTC-4)
  maintenance_window       = "sun:07:30-sun:08:30"
  copy_tags_to_snapshot    = true
  delete_automated_backups = true

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${local.name}-postgres-final"

  auto_minor_version_upgrade      = true
  apply_immediately               = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = { Name = "${local.name}-postgres" }
}

# ============================== SSM Parameter Store ==========================
# El backend lee todo el prefijo al iniciar (CONFIG_SOURCE=ssm) con el rol de la instancia.
resource "random_password" "jwt_access" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "database_url" {
  name        = "${var.ssm_parameter_prefix}/database_url"
  description = "Cadena de conexion a RDS PostgreSQL (Prisma)"
  type        = "SecureString"
  value = format(
    "postgresql://%s:%s@%s:%d/%s?schema=public&sslmode=require&connection_limit=10",
    var.db_username,
    random_password.db.result,
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    var.db_name,
  )
}

resource "aws_ssm_parameter" "jwt_access_secret" {
  name        = "${var.ssm_parameter_prefix}/jwt_access_secret"
  description = "Secreto de firma de los access token JWT"
  type        = "SecureString"
  value       = random_password.jwt_access.result
}

resource "aws_ssm_parameter" "jwt_refresh_secret" {
  name        = "${var.ssm_parameter_prefix}/jwt_refresh_secret"
  description = "Secreto de firma de los refresh token JWT"
  type        = "SecureString"
  value       = random_password.jwt_refresh.result
}

resource "aws_ssm_parameter" "s3_bucket" {
  name        = "${var.ssm_parameter_prefix}/s3_bucket"
  description = "Bucket S3 de documentos"
  type        = "String"
  value       = aws_s3_bucket.documents.bucket
}

resource "aws_ssm_parameter" "cors_origins" {
  name        = "${var.ssm_parameter_prefix}/cors_origins"
  description = "Origenes permitidos por CORS en la API"
  type        = "String"
  value       = join(",", local.cors_origins)
}

# Dominio de los colegios (multi-tenant). "-" = sin subdominios (SSM no admite valores vacíos).
resource "aws_ssm_parameter" "base_domain" {
  name        = "${var.ssm_parameter_prefix}/base_domain"
  description = "Dominio de los colegios: <slug>.<dominio>"
  type        = "String"
  value       = local.use_tenants ? var.tenant_base_domain : "-"
}

# Parámetros no secretos que Ansible usa para renderizar app.env.
resource "aws_ssm_parameter" "artifact_bucket" {
  name        = "${var.ssm_parameter_prefix}/artifact_bucket"
  description = "Bucket S3 de artefactos de despliegue"
  type        = "String"
  value       = aws_s3_bucket.artifacts.bucket
}

resource "aws_ssm_parameter" "public_url" {
  name        = "${var.ssm_parameter_prefix}/public_url"
  description = "URL publica de la aplicacion"
  type        = "String"
  value       = local.public_url
}

# ============================== S3: documentos ===============================
resource "aws_s3_bucket" "documents" {
  bucket        = "${local.name}-documentos-${local.account_id}"
  force_destroy = var.s3_force_destroy

  tags = { Name = "${local.name}-documentos" }
}

# Bucket privado: se bloquea todo acceso público.
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Cifrado en reposo SSE-S3 (AES-256).
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Versionado: el borrado lógico en la app nunca pierde el archivo.
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket     = aws_s3_bucket.documents.id
  depends_on = [aws_s3_bucket_versioning.documents]

  rule {
    id     = "versiones-antiguas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 180
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# CORS: el navegador sube (PUT) y descarga (GET) directo a S3 con las presigned URL.
resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = local.s3_cors_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Política: solo el rol de las EC2 (y los administradores) puede operar el bucket; solo TLS.
data "aws_iam_policy_document" "documents_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid     = "OnlyAppRoleAndAdmins"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "ArnNotEquals"
      variable = "aws:PrincipalArn"
      values = distinct(concat(
        [
          local.instance_role_arn,
          data.aws_iam_session_context.current.issuer_arn,
          "arn:${data.aws_partition.current.partition}:iam::${local.account_id}:root",
        ],
        var.extra_bucket_admin_arns,
      ))
    }
  }

  statement {
    sid    = "AllowAppRole"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*",
    ]
    principals {
      type        = "AWS"
      identifiers = [local.instance_role_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "documents" {
  bucket     = aws_s3_bucket.documents.id
  policy     = data.aws_iam_policy_document.documents_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.documents]
}

# ============================== S3: artefactos ===============================
resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.name}-artefactos-${local.account_id}"
  force_destroy = true

  tags = { Name = "${local.name}-artefactos" }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket     = aws_s3_bucket.artifacts.id
  depends_on = [aws_s3_bucket_versioning.artifacts]

  # Transferencias temporales del plugin aws_ssm de Ansible.
  rule {
    id     = "ansible-ssm-temporales"
    status = "Enabled"
    filter {
      prefix = "ansible-ssm/"
    }
    expiration {
      days = 1
    }
  }

  rule {
    id     = "versiones-antiguas-artefactos"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

data "aws_iam_policy_document" "artifacts_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket     = aws_s3_bucket.artifacts.id
  policy     = data.aws_iam_policy_document.artifacts_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# Artefacto de referencia (ansible/files) para que las instancias arranquen configuradas.
locals {
  reference_artifact_path = "${path.module}/../ansible/files/gestor-documental.tar.gz"
  cloudwatch_config_path  = "${path.module}/../ansible/files/cloudwatch-agent-config.json"
  upload_artifact         = var.upload_reference_artifact && fileexists(local.reference_artifact_path)
}

resource "aws_s3_object" "reference_artifact" {
  count  = local.upload_artifact ? 1 : 0
  bucket = aws_s3_bucket.artifacts.id
  key    = var.artifact_object_key
  source = local.reference_artifact_path
  etag   = local.upload_artifact ? filemd5(local.reference_artifact_path) : null

  # Ansible publica versiones nuevas en la misma clave: Terraform no las revierte.
  lifecycle {
    ignore_changes = [source, etag]
  }
}

resource "aws_s3_object" "cloudwatch_config" {
  count  = fileexists(local.cloudwatch_config_path) ? 1 : 0
  bucket = aws_s3_bucket.artifacts.id
  key    = "config/cloudwatch-agent-config.json"
  source = local.cloudwatch_config_path
  etag   = fileexists(local.cloudwatch_config_path) ? filemd5(local.cloudwatch_config_path) : null
}
