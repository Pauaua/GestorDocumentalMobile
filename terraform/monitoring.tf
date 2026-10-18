# -----------------------------------------------------------------------------
# Monitoreo: SNS (email), alarmas de CloudWatch, logs de la app y dashboard
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alertas"
}

# La suscripción queda "PendingConfirmation" hasta que se confirme el correo recibido.
resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Grupo de logs donde CloudWatch Agent envía /var/log/gestor-documental/app.log
resource "aws_cloudwatch_log_group" "app" {
  name              = local.app_log_group
  retention_in_days = var.log_retention_days
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
  alb_dims      = { LoadBalancer = aws_lb.app.arn_suffix }
  tg_dims       = { LoadBalancer = aws_lb.app.arn_suffix, TargetGroup = aws_lb_target_group.app.arn_suffix }
  rds_dims      = { DBInstanceIdentifier = aws_db_instance.main.identifier }
}

# ---------- EC2 / ASG ----------
resource "aws_cloudwatch_metric_alarm" "asg_cpu_high" {
  alarm_name          = "${local.name}-asg-cpu-alta"
  alarm_description   = "CPU promedio del ASG sobre 80% por 10 minutos (el escalado apunta a ${var.cpu_target_value}%)"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = { AutoScalingGroupName = aws_autoscaling_group.app.name }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------- ALB / Target Group ----------
resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "${local.name}-tg-hosts-no-saludables"
  alarm_description   = "Hay instancias que no pasan el health check /health"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  dimensions          = local.tg_dims
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "healthy_hosts_low" {
  alarm_name          = "${local.name}-tg-sin-hosts-saludables"
  alarm_description   = "Menos instancias saludables que el mínimo del ASG"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  dimensions          = local.tg_dims
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = var.asg_min_size
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# 5XX generados por el ALB + por las instancias (metric math).
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-errores-5xx"
  alarm_description   = "Más de 10 respuestas 5XX (ALB + app) en 5 minutos"
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  metric_query {
    id          = "total5xx"
    expression  = "FILL(elb5xx, 0) + FILL(target5xx, 0)"
    label       = "Errores 5XX"
    return_data = true
  }

  metric_query {
    id = "elb5xx"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_ELB_5XX_Count"
      dimensions  = local.alb_dims
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "target5xx"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      dimensions  = local.alb_dims
      period      = 300
      stat        = "Sum"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_latency_p95" {
  alarm_name          = "${local.name}-alb-latencia-p95"
  alarm_description   = "Latencia p95 de las respuestas sobre ${var.alarm_p95_latency_seconds} s"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  dimensions          = local.alb_dims
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.alarm_p95_latency_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------- RDS ----------
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-cpu-alta"
  alarm_description   = "CPU de RDS sobre 80% por 10 minutos"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = local.rds_dims
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name}-rds-conexiones"
  alarm_description   = "Conexiones a RDS sobre ${var.alarm_db_connections}"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = local.rds_dims
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.alarm_db_connections
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${local.name}-rds-almacenamiento-bajo"
  alarm_description   = "Almacenamiento libre de RDS bajo ${floor(var.alarm_db_free_storage_bytes / 1073741824)} GiB"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = local.rds_dims
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.alarm_db_free_storage_bytes
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------- Dashboard ----------
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name}-gestor-documental"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "text", x = 0, y = 0, width = 24, height = 2
        properties = {
          markdown = "## RTLCO · Gestor documental escolar\nALB → ASG EC2 (subredes privadas) → RDS PostgreSQL Multi-AZ (subredes aisladas) · URL: ${local.public_url}"
        }
      },
      {
        type = "metric", x = 0, y = 2, width = 8, height = 6
        properties = {
          title   = "Solicitudes (ALB)"
          region  = local.region
          stat    = "Sum"
          period  = 60
          view    = "timeSeries"
          metrics = [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix, { label = "Solicitudes" }]]
        }
      },
      {
        type = "metric", x = 8, y = 2, width = 8, height = 6
        properties = {
          title  = "Latencia de respuesta (s)"
          region = local.region
          period = 60
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "p50", label = "p50" }],
            ["...", { stat = "p95", label = "p95" }],
            ["...", { stat = "p99", label = "p99" }],
          ]
          annotations = { horizontal = [{ value = var.alarm_p95_latency_seconds, label = "Umbral p95" }] }
        }
      },
      {
        type = "metric", x = 16, y = 2, width = 8, height = 6
        properties = {
          title  = "Errores HTTP"
          region = local.region
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.app.arn_suffix, { label = "5XX app" }],
            [".", "HTTPCode_ELB_5XX_Count", ".", ".", { label = "5XX ALB" }],
            [".", "HTTPCode_Target_4XX_Count", ".", ".", { label = "4XX app" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 8, width = 8, height = 6
        properties = {
          title  = "Instancias (ASG y Target Group)"
          region = local.region
          period = 60
          view   = "timeSeries"
          metrics = [
            ["AWS/AutoScaling", "GroupInServiceInstances", "AutoScalingGroupName", aws_autoscaling_group.app.name, { stat = "Average", label = "En servicio" }],
            [".", "GroupDesiredCapacity", ".", ".", { stat = "Average", label = "Deseadas" }],
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Minimum", label = "Saludables" }],
            [".", "UnHealthyHostCount", ".", ".", ".", ".", { stat = "Maximum", label = "No saludables" }],
          ]
        }
      },
      {
        type = "metric", x = 8, y = 8, width = 8, height = 6
        properties = {
          title       = "CPU promedio del ASG (%)"
          region      = local.region
          stat        = "Average"
          period      = 60
          view        = "timeSeries"
          metrics     = [["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", aws_autoscaling_group.app.name, { label = "CPU EC2" }]]
          annotations = { horizontal = [{ value = var.cpu_target_value, label = "Objetivo target tracking" }] }
          yAxis       = { left = { min = 0, max = 100 } }
        }
      },
      {
        type = "metric", x = 16, y = 8, width = 8, height = 6
        properties = {
          title  = "RDS: CPU (%) y conexiones"
          region = local.region
          period = 60
          view   = "timeSeries"
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier, { stat = "Average", label = "CPU" }],
            [".", "DatabaseConnections", ".", ".", { stat = "Maximum", label = "Conexiones", yAxis = "right" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 14, width = 12, height = 6
        properties = {
          title  = "RDS: almacenamiento libre y memoria (bytes)"
          region = local.region
          stat   = "Minimum"
          period = 300
          view   = "timeSeries"
          metrics = [
            ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", aws_db_instance.main.identifier, { label = "Almacenamiento libre" }],
            [".", "FreeableMemory", ".", ".", { label = "Memoria libre" }],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 14, width = 12, height = 6
        properties = {
          title  = "RDS: latencia de lectura/escritura (s)"
          region = local.region
          stat   = "Average"
          period = 60
          view   = "timeSeries"
          metrics = [
            ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", aws_db_instance.main.identifier, { label = "Lectura" }],
            [".", "WriteLatency", ".", ".", { label = "Escritura" }],
          ]
        }
      },
      {
        type = "alarm", x = 0, y = 20, width = 24, height = 4
        properties = {
          title = "Estado de las alarmas"
          alarms = [
            aws_cloudwatch_metric_alarm.asg_cpu_high.arn,
            aws_cloudwatch_metric_alarm.unhealthy_hosts.arn,
            aws_cloudwatch_metric_alarm.healthy_hosts_low.arn,
            aws_cloudwatch_metric_alarm.alb_5xx.arn,
            aws_cloudwatch_metric_alarm.alb_latency_p95.arn,
            aws_cloudwatch_metric_alarm.rds_cpu.arn,
            aws_cloudwatch_metric_alarm.rds_connections.arn,
            aws_cloudwatch_metric_alarm.rds_free_storage.arn,
          ]
        }
      },
      {
        type = "log", x = 0, y = 24, width = 24, height = 6
        properties = {
          title  = "Errores recientes de la aplicación"
          region = local.region
          query  = "SOURCE '${local.app_log_group}' | fields @timestamp, msg, req.url, res.statusCode, err.message | filter level >= 50 | sort @timestamp desc | limit 50"
          view   = "table"
        }
      },
    ]
  })
}
