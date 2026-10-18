# -----------------------------------------------------------------------------
# Parámetros configurables del proyecto
# -----------------------------------------------------------------------------

# ---------- General ----------
variable "project_name" {
  description = "Nombre del proyecto (prefijo de los recursos)."
  type        = string
  default     = "rtlco"
}

variable "environment" {
  description = "Ambiente (prod, staging, dev)."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "Región de AWS."
  type        = string
  default     = "us-east-1"
}

variable "extra_tags" {
  description = "Tags adicionales para todos los recursos."
  type        = map(string)
  default     = {}
}

# ---------- Red ----------
variable "vpc_cidr" {
  description = "CIDR de la VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs de las subredes públicas (ALB y NAT), una por AZ."
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]
  validation {
    condition     = length(var.public_subnet_cidrs) == 2
    error_message = "Se requieren exactamente 2 subredes públicas (una por AZ)."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDRs de las subredes privadas (EC2 del ASG), una por AZ."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
  validation {
    condition     = length(var.private_subnet_cidrs) == 2
    error_message = "Se requieren exactamente 2 subredes privadas (una por AZ)."
  }
}

variable "isolated_subnet_cidrs" {
  description = "CIDRs de las subredes aisladas (RDS, sin ruta a internet), una por AZ."
  type        = list(string)
  default     = ["10.20.20.0/24", "10.20.21.0/24"]
  validation {
    condition     = length(var.isolated_subnet_cidrs) == 2
    error_message = "Se requieren exactamente 2 subredes aisladas (una por AZ)."
  }
}

variable "enable_nat_gateway" {
  description = <<-EOT
    true: las EC2 quedan en subredes privadas y salen a internet por NAT Gateway (~USD 33/mes + tráfico).
    false (modo económico): las EC2 quedan en subredes públicas con IP pública; el security group sigue
    aceptando tráfico entrante solo desde el ALB y la base de datos sigue aislada.
  EOT
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "true: un NAT Gateway (más barato). false: un NAT por AZ (alta disponibilidad)."
  type        = bool
  default     = true
}

# ---------- Cómputo ----------
variable "instance_type" {
  description = "Tipo de instancia EC2 de la aplicación."
  type        = string
  default     = "t3.micro"
}

variable "asg_min_size" {
  description = "Capacidad mínima del Auto Scaling Group."
  type        = number
  default     = 2
}

variable "asg_desired_capacity" {
  description = "Capacidad deseada del Auto Scaling Group."
  type        = number
  default     = 2
}

variable "asg_max_size" {
  description = "Capacidad máxima del Auto Scaling Group."
  type        = number
  default     = 6
}

variable "cpu_target_value" {
  description = "Objetivo de CPU promedio (%) de la política target tracking."
  type        = number
  default     = 60
}

variable "app_port" {
  description = "Puerto en que escucha la aplicación Node.js en las instancias."
  type        = number
  default     = 3000
}

variable "root_volume_size" {
  description = "Tamaño (GiB) del volumen raíz gp3 cifrado."
  type        = number
  default     = 16
}

variable "existing_instance_profile" {
  description = <<-EOT
    Instance profile existente para las EC2. Déjalo vacío para que Terraform cree el rol IAM
    con permisos mínimos. En AWS Academy (no se pueden crear roles) usa "LabInstanceProfile".
  EOT
  type        = string
  default     = ""
}

variable "artifact_object_key" {
  description = "Clave del artefacto de la aplicación en el bucket de artefactos."
  type        = string
  default     = "releases/gestor-documental.tar.gz"
}

variable "upload_reference_artifact" {
  description = "Sube ../ansible/files/gestor-documental.tar.gz al bucket para que las instancias arranquen configuradas."
  type        = bool
  default     = true
}

variable "rate_limit_max" {
  description = "Solicitudes por minuto por IP permitidas en /api (súbelo para la prueba de carga desde una sola IP)."
  type        = number
  default     = 1200
}

# ---------- Base de datos ----------
variable "db_instance_class" {
  description = "Clase de instancia de Amazon RDS."
  type        = string
  default     = "db.t3.micro"
}

variable "db_engine_version" {
  description = "Versión de PostgreSQL (mayor o mayor.menor)."
  type        = string
  default     = "16"
}

variable "db_allocated_storage" {
  description = "Almacenamiento inicial (GiB)."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Tope de autoescalado de almacenamiento (GiB)."
  type        = number
  default     = 100
}

variable "db_multi_az" {
  description = "Despliegue Multi-AZ (réplica síncrona en standby en otra AZ)."
  type        = bool
  default     = true
}

variable "db_name" {
  description = "Nombre de la base de datos."
  type        = string
  default     = "gestor_documental"
}

variable "db_username" {
  description = "Usuario maestro de la base de datos."
  type        = string
  default     = "gestor_admin"
}

variable "db_backup_retention_days" {
  description = "Días de retención de los backups automáticos."
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Protección contra borrado de la instancia RDS (actívala en producción real)."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Omitir el snapshot final al destruir (true facilita terraform destroy en la evaluación)."
  type        = bool
  default     = true
}

variable "ssm_parameter_prefix" {
  description = "Prefijo de los parámetros en SSM Parameter Store (secretos y configuración)."
  type        = string
  default     = "/rtlco"
}

# ---------- Almacenamiento ----------
variable "s3_force_destroy" {
  description = "Permite borrar los buckets con objetos en terraform destroy (true para la evaluación)."
  type        = bool
  default     = true
}

variable "extra_cors_origins" {
  description = "Orígenes adicionales permitidos por CORS en el bucket (p. ej. http://localhost:8081)."
  type        = list(string)
  default     = []
}

variable "extra_bucket_admin_arns" {
  description = "ARNs de roles/usuarios adicionales con acceso administrativo al bucket de documentos."
  type        = list(string)
  default     = []
}

# ---------- Publicación (Route 53 + ACM) ----------
variable "domain_name" {
  description = "Dominio público (p. ej. app.rtlco.cl). Vacío = sin dominio: HTTP en el DNS del ALB."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "ID de la hosted zone de Route 53. Vacío = se busca por hosted_zone_name."
  type        = string
  default     = ""
}

variable "hosted_zone_name" {
  description = "Nombre de la hosted zone (p. ej. rtlco.cl). Se usa si hosted_zone_id está vacío."
  type        = string
  default     = ""
}

variable "tenant_base_domain" {
  description = <<-EOT
    Dominio de los colegios (multi-tenant): cada colegio entra por <slug>.<este dominio>, p. ej. demo.rtlco.cl.
    Agrega *.<dominio> al certificado y un registro comodín al ALB. Debe pertenecer a la hosted zone.
    Vacío = sin subdominios (la app nativa y la web usan el código del colegio).
  EOT
  type        = string
  default     = ""
}

variable "create_api_record" {
  description = "Crea también el registro api.<dominio> apuntando al ALB."
  type        = bool
  default     = true
}

# ---------- Correo (Amazon SES) ----------
variable "mail_from_domain" {
  description = <<-EOT
    Dominio desde el que se envían los avisos por correo (p. ej. rtlco.cl), verificado en SES con DKIM
    en la misma hosted zone. Vacío = los correos solo se registran en el log (sin envío).
    Una cuenta nueva de SES está en sandbox: pide acceso de producción para escribir a cualquier destinatario.
  EOT
  type        = string
  default     = ""
}

variable "mail_from_name" {
  description = "Nombre visible del remitente."
  type        = string
  default     = "RTLCO"
}

# ---------- Monitoreo ----------
variable "alert_email" {
  description = "Correo que recibe las alarmas (debe confirmar la suscripción de SNS)."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "Retención de los logs de la aplicación en CloudWatch Logs."
  type        = number
  default     = 14
}

variable "alarm_p95_latency_seconds" {
  description = "Umbral de latencia p95 del ALB (segundos)."
  type        = number
  default     = 1.5
}

variable "alarm_db_connections" {
  description = "Umbral de conexiones a RDS."
  type        = number
  default     = 80
}

variable "alarm_db_free_storage_bytes" {
  description = "Umbral mínimo de almacenamiento libre en RDS (bytes)."
  type        = number
  default     = 2147483648 # 2 GiB
}
