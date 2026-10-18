# -----------------------------------------------------------------------------
# Cómputo y publicación:
#   ALB (subredes públicas) + Target Group (/health) + listeners 80/443 (ACM)
#   Launch Template (Amazon Linux 2023, IMDSv2) + Auto Scaling Group (subredes privadas)
#   IAM (instance profile de permisos mínimos) + Route 53 (A alias → ALB)
# -----------------------------------------------------------------------------

locals {
  app_dir       = "/opt/gestor-documental"
  app_env_file  = "/etc/gestor-documental/app.env"
  app_log_file  = "/var/log/gestor-documental/app.log"
  app_log_group = "/${var.project_name}/gestor-documental/app"
}

# ============================== IAM ==========================================
# Si existing_instance_profile está vacío se crea un rol con permisos mínimos.
# En AWS Academy se reutiliza LabInstanceProfile (LabRole), que ya existe.
locals {
  create_iam            = var.existing_instance_profile == ""
  instance_profile_name = local.create_iam ? aws_iam_instance_profile.app[0].name : data.aws_iam_instance_profile.existing[0].name
  instance_role_arn     = local.create_iam ? aws_iam_role.app[0].arn : data.aws_iam_instance_profile.existing[0].role_arn
}

data "aws_iam_instance_profile" "existing" {
  count = local.create_iam ? 0 : 1
  name  = var.existing_instance_profile
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  count              = local.create_iam ? 1 : 0
  name               = "${local.name}-app-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# SSM Session Manager (Ansible por aws_ssm, sin puerto 22 ni bastión).
resource "aws_iam_role_policy_attachment" "ssm_core" {
  count      = local.create_iam ? 1 : 0
  role       = aws_iam_role.app[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# CloudWatch Agent (métricas y logs).
resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  count      = local.create_iam ? 1 : 0
  role       = aws_iam_role.app[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/CloudWatchAgentServerPolicy"
}

data "aws_iam_policy_document" "app" {
  # Bucket de documentos: solo objetos (subida/descarga con presigned URL firmadas por este rol).
  statement {
    sid       = "DocumentsObjects"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }
  statement {
    sid       = "DocumentsList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]
  }
  # Bucket de artefactos: solo lectura (las instancias nuevas descargan la última versión).
  statement {
    sid       = "ArtifactsRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
  statement {
    sid       = "ArtifactsList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.artifacts.arn]
  }
  # Configuración y secretos (DATABASE_URL y JWT) en SSM Parameter Store.
  statement {
    sid     = "SsmParameters"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:${data.aws_partition.current.partition}:ssm:${local.region}:${local.account_id}:parameter${var.ssm_parameter_prefix}",
      "arn:${data.aws_partition.current.partition}:ssm:${local.region}:${local.account_id}:parameter${var.ssm_parameter_prefix}/*",
    ]
  }
  statement {
    sid       = "DecryptSecureStrings"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${local.region}.amazonaws.com"]
    }
  }
  # Alternativa soportada por el backend (CONFIG_SOURCE=secretsmanager).
  statement {
    sid       = "SecretsManager"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:${data.aws_partition.current.partition}:secretsmanager:${local.region}:${local.account_id}:secret:${local.name}/*"]
  }
  # Correos de aviso (Amazon SES) solo desde la identidad del dominio.
  dynamic "statement" {
    for_each = local.use_ses ? [1] : []
    content {
      sid       = "SesSend"
      actions   = ["ses:SendEmail"]
      resources = [aws_sesv2_email_identity.mail[0].arn]
    }
  }
}

resource "aws_iam_role_policy" "app" {
  count  = local.create_iam ? 1 : 0
  name   = "${local.name}-app-least-privilege"
  role   = aws_iam_role.app[0].id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_instance_profile" "app" {
  count = local.create_iam ? 1 : 0
  name  = "${local.name}-app-instance-profile"
  role  = aws_iam_role.app[0].name
}

# ============================== ALB ==========================================
resource "aws_lb" "app" {
  name                       = "${local.name}-alb"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
  idle_timeout               = 60

  tags = { Name = "${local.name}-alb" }
}

resource "aws_lb_target_group" "app" {
  name                 = "${local.name}-tg"
  port                 = var.app_port
  protocol             = "HTTP"
  vpc_id               = aws_vpc.main.id
  target_type          = "instance"
  deregistration_delay = 30

  # /health verifica la base de datos y responde con el id de la instancia.
  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = { Name = "${local.name}-tg" }
}

# ---------- Certificado ACM validado por DNS (solo con dominio) ----------
data "aws_route53_zone" "main" {
  count        = local.use_domain ? 1 : 0
  zone_id      = var.hosted_zone_id != "" ? var.hosted_zone_id : null
  name         = var.hosted_zone_id == "" ? var.hosted_zone_name : null
  private_zone = false
}

resource "aws_acm_certificate" "app" {
  count       = local.use_domain ? 1 : 0
  domain_name = var.domain_name
  subject_alternative_names = concat(
    var.create_api_record ? ["api.${var.domain_name}"] : [],
    local.use_tenants ? ["*.${var.tenant_base_domain}"] : [],
  )
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# *.dominio y dominio comparten el registro de validación: allow_overwrite evita el conflicto.
resource "aws_route53_record" "cert_validation" {
  for_each = local.use_domain ? {
    for dvo in aws_acm_certificate.app[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  zone_id         = data.aws_route53_zone.main[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "app" {
  count                   = local.use_domain ? 1 : 0
  certificate_arn         = aws_acm_certificate.app[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ---------- Listeners ----------
# Puerto 80: con dominio redirige a HTTPS (301); sin dominio sirve la app directamente.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = local.use_domain ? "redirect" : "forward"
    target_group_arn = local.use_domain ? null : aws_lb_target_group.app.arn

    dynamic "redirect" {
      for_each = local.use_domain ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.use_domain ? 1 : 0
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.app[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ============================== Route 53 =====================================
resource "aws_route53_record" "app" {
  count   = local.use_domain ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "api" {
  count   = local.use_domain && var.create_api_record ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

# Comodín de los colegios: demo.rtlco.cl, colegio-x.rtlco.cl, ... → ALB.
resource "aws_route53_record" "tenants" {
  count   = local.use_tenants ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = "*.${var.tenant_base_domain}"
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

# ============================== Launch Template ==============================
data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

locals {
  # Bootstrap de cada instancia nueva del ASG: deja la app instalada y corriendo
  # con el último artefacto publicado en S3 (Ansible lo actualiza en cada despliegue).
  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    exec > >(tee -a /var/log/user-data.log) 2>&1
    echo "== Bootstrap Gestor Documental $(date -Is) =="

    REGION="${local.region}"
    ARTIFACT_BUCKET="${aws_s3_bucket.artifacts.bucket}"
    ARTIFACT_KEY="${var.artifact_object_key}"
    APP_DIR="${local.app_dir}"

    # 1. Paquetes base: Python (para Ansible), agente SSM y CloudWatch Agent
    dnf install -y python3 python3-pip tar gzip xz amazon-ssm-agent amazon-cloudwatch-agent
    systemctl enable --now amazon-ssm-agent

    # 2. Node.js 20 LTS (binario oficial verificado con SHA-256)
    if ! command -v node >/dev/null || ! node -v | grep -q '^v20\.'; then
      BASE=https://nodejs.org/dist/latest-v20.x
      FILE=$(curl -fsSL "$BASE/SHASUMS256.txt" | awk '/linux-x64.tar.xz$/ {print $2}')
      curl -fsSLo "/tmp/$FILE" "$BASE/$FILE"
      curl -fsSL "$BASE/SHASUMS256.txt" | grep " $FILE\$" | (cd /tmp && sha256sum -c -)
      mkdir -p /opt/nodejs && tar -xJf "/tmp/$FILE" -C /opt/nodejs --strip-components=1
      ln -sf /opt/nodejs/bin/node /usr/local/bin/node
      ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
      ln -sf /opt/nodejs/bin/npx /usr/local/bin/npx
    fi

    # 3. Usuario de servicio y directorios
    id gestor >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /sbin/nologin gestor
    mkdir -p "$APP_DIR/releases" /etc/gestor-documental /var/log/gestor-documental
    chown gestor:gestor /var/log/gestor-documental

    # 4. Variables de entorno (los secretos se leen en runtime desde SSM con el rol IAM)
    cat > ${local.app_env_file} <<'ENV'
    NODE_ENV=production
    PORT=${var.app_port}
    CONFIG_SOURCE=ssm
    SSM_PARAMETER_PREFIX=${var.ssm_parameter_prefix}
    AWS_REGION=${local.region}
    LOG_FILE=${local.app_log_file}
    LOG_LEVEL=info
    WEB_DIST_DIR=${local.app_dir}/current/public
    RATE_LIMIT_MAX=${var.rate_limit_max}
    NOTIFICATIONS_WORKER=true
    PUSH_TRANSPORT=expo
    ENV
    chmod 640 ${local.app_env_file} && chown root:gestor ${local.app_env_file}

    # 5. Artefacto (si aún no se publicó, Ansible lo instalará después)
    if aws s3api head-object --bucket "$ARTIFACT_BUCKET" --key "$ARTIFACT_KEY" --region "$REGION" >/dev/null 2>&1; then
      RELEASE="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
      mkdir -p "$RELEASE"
      aws s3 cp "s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY" /tmp/gestor-documental.tar.gz --region "$REGION"
      tar -xzf /tmp/gestor-documental.tar.gz -C "$RELEASE" --strip-components=1
      chown -R gestor:gestor "$APP_DIR"
      (cd "$RELEASE" && runuser -u gestor -- env HOME="$APP_DIR" npm ci --omit=dev --no-audit --no-fund)
      ln -sfn "$RELEASE" "$APP_DIR/current"
      echo "APP_VERSION=$(node -p "require('$RELEASE/VERSION.json').revision" 2>/dev/null || echo desconocida)" >> ${local.app_env_file}

      # Migraciones versionadas (idempotentes; Prisma usa un lock en la BD)
      for i in 1 2 3 4 5; do
        runuser -u gestor -- bash -c "set -a; . ${local.app_env_file}; set +a; cd $APP_DIR/current && node dist/src/scripts/migrate.js" && break
        echo "Migración falló (intento $i), reintentando..."; sleep 15
      done
    else
      echo "No hay artefacto en s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY todavía"
    fi

    # 6. Servicio systemd con reinicio automático
    cat > /etc/systemd/system/gestor-documental.service <<'UNIT'
    [Unit]
    Description=RTLCO - Gestor documental escolar (API + web)
    After=network-online.target
    Wants=network-online.target

    [Service]
    Type=simple
    User=gestor
    Group=gestor
    WorkingDirectory=${local.app_dir}/current
    EnvironmentFile=${local.app_env_file}
    ExecStart=/usr/local/bin/node dist/src/index.js
    Restart=always
    RestartSec=5
    NoNewPrivileges=true
    ProtectSystem=full
    PrivateTmp=true
    ReadWritePaths=/var/log/gestor-documental

    [Install]
    WantedBy=multi-user.target
    UNIT
    systemctl daemon-reload
    if [ -L "$APP_DIR/current" ]; then systemctl enable --now gestor-documental; fi

    # 7. CloudWatch Agent con la configuración publicada por Ansible/Terraform
    if aws s3 cp "s3://$ARTIFACT_BUCKET/config/cloudwatch-agent-config.json" /opt/aws/amazon-cloudwatch-agent/etc/gestor-documental.json --region "$REGION"; then
      /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s \
        -c file:/opt/aws/amazon-cloudwatch-agent/etc/gestor-documental.json
    fi
    echo "== Bootstrap terminado $(date -Is) =="
  EOT
}

resource "aws_launch_template" "app" {
  name_prefix   = "${local.name}-app-"
  image_id      = data.aws_ssm_parameter.al2023_ami.value
  instance_type = var.instance_type
  user_data     = base64encode(local.user_data)

  # Con NAT: subred privada sin IP pública. Modo económico: IP pública (solo salida; la entrada sigue
  # limitada al ALB por el security group).
  vpc_security_group_ids = var.enable_nat_gateway ? [aws_security_group.app.id] : null

  dynamic "network_interfaces" {
    for_each = var.enable_nat_gateway ? [] : [1]
    content {
      associate_public_ip_address = true
      security_groups             = [aws_security_group.app.id]
      delete_on_termination       = true
    }
  }

  iam_instance_profile {
    name = local.instance_profile_name
  }

  # IMDSv2 obligatorio (token de sesión).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.root_volume_size
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = false
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name         = "${local.name}-app"
      AnsibleGroup = "gestor_documental"
    })
  }

  tag_specifications {
    resource_type = "volume"
    tags          = merge(local.common_tags, { Name = "${local.name}-app-root" })
  }

  # El artefacto de referencia debe estar en S3 antes de que arranquen las instancias.
  depends_on = [aws_s3_object.reference_artifact, aws_ssm_parameter.database_url]
}

# ============================== Auto Scaling Group ===========================
resource "aws_autoscaling_group" "app" {
  name                      = "${local.name}-asg"
  vpc_zone_identifier       = local.app_subnet_ids
  min_size                  = var.asg_min_size
  desired_capacity          = var.asg_desired_capacity
  max_size                  = var.asg_max_size
  health_check_type         = "ELB"
  health_check_grace_period = 420
  target_group_arns         = [aws_lb_target_group.app.arn]
  default_instance_warmup   = 180

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  # Métricas de grupo para el dashboard (instancias en servicio, etc.).
  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupPendingInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances",
  ]

  # Reemplazo gradual de instancias cuando cambia el Launch Template.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 180
    }
  }

  tag {
    key                 = "Name"
    value               = "${local.name}-app"
    propagate_at_launch = true
  }

  tag {
    key                 = "AnsibleGroup"
    value               = "gestor_documental"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    # El escalado automático cambia desired_capacity: Terraform no debe revertirlo.
    ignore_changes = [desired_capacity]
  }
}

# Target tracking: mantiene la CPU promedio del grupo cerca del 60%.
resource "aws_autoscaling_policy" "cpu_target" {
  name                   = "${local.name}-cpu-target-tracking"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = var.cpu_target_value
  }
}
