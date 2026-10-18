# -----------------------------------------------------------------------------
# Correo de avisos: identidad de dominio en Amazon SES con DKIM (registros en Route 53).
# El backend lee MAIL_TRANSPORT y MAIL_FROM desde SSM; sin dominio queda en "log" (no envía).
# -----------------------------------------------------------------------------

resource "aws_sesv2_email_identity" "mail" {
  count          = local.use_ses ? 1 : 0
  email_identity = var.mail_from_domain
}

# SES entrega 3 tokens DKIM: <token>._domainkey.<dominio> → <token>.dkim.amazonses.com
resource "aws_route53_record" "ses_dkim" {
  count   = local.use_ses ? 3 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = "${aws_sesv2_email_identity.mail[0].dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.mail_from_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.mail[0].dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_ssm_parameter" "mail_transport" {
  name        = "${var.ssm_parameter_prefix}/mail_transport"
  description = "Transporte de correo del backend (ses o log)"
  type        = "String"
  value       = local.use_ses ? "ses" : "log"
}

resource "aws_ssm_parameter" "mail_from" {
  name        = "${var.ssm_parameter_prefix}/mail_from"
  description = "Remitente de los avisos por correo"
  type        = "String"
  value       = "${var.mail_from_name} <no-responder@${local.use_ses ? var.mail_from_domain : "rtlco.cl"}>"
}
