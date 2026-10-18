# -----------------------------------------------------------------------------
# Salidas
# -----------------------------------------------------------------------------

output "alb_dns_name" {
  description = "DNS público del Application Load Balancer."
  value       = aws_lb.app.dns_name
}

output "public_url" {
  description = "URL pública de la aplicación (https://<dominio> o http://<DNS del ALB>)."
  value       = local.public_url
}

output "api_url" {
  description = "URL base de la API REST."
  value       = "${local.use_domain && var.create_api_record ? "https://api.${var.domain_name}" : local.public_url}/api/v1"
}

output "rds_endpoint" {
  description = "Endpoint de RDS PostgreSQL (solo accesible desde las EC2)."
  value       = aws_db_instance.main.endpoint
}

output "rds_multi_az" {
  description = "Indica si RDS está desplegado en Multi-AZ."
  value       = aws_db_instance.main.multi_az
}

output "documents_bucket" {
  description = "Bucket S3 privado de documentos."
  value       = aws_s3_bucket.documents.bucket
}

output "artifacts_bucket" {
  description = "Bucket S3 de artefactos de despliegue (y transferencias de Ansible por SSM)."
  value       = aws_s3_bucket.artifacts.bucket
}

output "asg_name" {
  description = "Nombre del Auto Scaling Group."
  value       = aws_autoscaling_group.app.name
}

output "target_group_arn" {
  description = "ARN del Target Group (útil para describe-target-health en la prueba de falla)."
  value       = aws_lb_target_group.app.arn
}

output "sns_topic_arn" {
  description = "ARN del tópico SNS de alertas."
  value       = aws_sns_topic.alerts.arn
}

output "dashboard_url" {
  description = "URL del dashboard de CloudWatch."
  value       = "https://${local.region}.console.aws.amazon.com/cloudwatch/home?region=${local.region}#dashboards/dashboard/${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "ssm_parameter_prefix" {
  description = "Prefijo de parámetros SSM que lee la aplicación."
  value       = var.ssm_parameter_prefix
}

output "rds_instance_id" {
  description = "Identificador de la instancia RDS (para reboot-db-instance --force-failover)."
  value       = aws_db_instance.main.identifier
}

output "app_log_group" {
  description = "Grupo de CloudWatch Logs de la aplicación."
  value       = aws_cloudwatch_log_group.app.name
}

output "aws_region" {
  description = "Región desplegada."
  value       = local.region
}
