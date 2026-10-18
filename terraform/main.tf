# -----------------------------------------------------------------------------
# RTLCO - Gestor documental escolar
# Provider de AWS, datos de la cuenta/región y zonas de disponibilidad.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Estado remoto opcional (recomendado en equipo). Descomentar y ajustar:
  # backend "s3" {
  #   bucket       = "mi-bucket-de-estado-terraform"
  #   key          = "rtlco/terraform.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.aws_region

  # Tags comunes aplicados a todos los recursos que los soportan.
  default_tags {
    tags = local.common_tags
  }
}

# Zonas de disponibilidad disponibles en la región (se usan las 2 primeras).
data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_partition" "current" {}

# ARN "real" de quien ejecuta Terraform (rol o usuario, no la sesión asumida).
# Se usa en la política del bucket para no bloquear al administrador.
data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}

locals {
  # Nombre base de recursos (S3 y ALB no aceptan "_").
  name       = replace(var.project_name, "_", "-")
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)

  common_tags = merge(
    {
      Project     = "rtlco"
      Environment = var.environment
      ManagedBy   = "terraform"
      Application = "gestor-documental"
    },
    var.extra_tags,
  )

  # Publicación: con dominio → HTTPS (ACM + Route 53); sin dominio → HTTP en el DNS del ALB.
  use_domain = var.domain_name != ""
  public_url = local.use_domain ? "https://${var.domain_name}" : "http://${aws_lb.app.dns_name}"
  cors_origins = distinct(compact(concat(
    [local.public_url],
    local.use_domain && var.create_api_record ? ["https://api.${var.domain_name}"] : [],
    var.extra_cors_origins,
  )))

  # Multi-tenant: <slug>.tenant_base_domain → mismo ALB (el backend resuelve el colegio por el host).
  use_tenants = local.use_domain && var.tenant_base_domain != ""
  # S3 admite un comodín en el origen CORS: los navegadores de cada colegio suben directo al bucket.
  # Avisos por correo: SES con la identidad del dominio (requiere la hosted zone para los registros DKIM).
  use_ses = local.use_domain && var.mail_from_domain != ""

  s3_cors_origins = concat(local.cors_origins, local.use_tenants ? ["https://*.${var.tenant_base_domain}"] : [])
}
