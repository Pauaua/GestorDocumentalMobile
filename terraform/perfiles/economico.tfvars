# Perfil económico (etapa inicial / plan básico): ~USD 50-60 al mes para todos los colegios.
# Uso: terraform apply -var-file=perfiles/economico.tfvars -var-file=terraform.tfvars
# Sin NAT Gateway: las EC2 salen a internet con IP pública; la entrada sigue limitada al ALB.
enable_nat_gateway   = false
instance_type        = "t3.small" # bcrypt (12 rondas) satura los créditos de CPU de una t3.micro en horas punta
asg_min_size         = 1
asg_desired_capacity = 1
asg_max_size         = 3
db_instance_class    = "db.t4g.micro"
db_multi_az          = false # sin standby: ante una falla de la AZ, RDS restaura desde respaldo (minutos)
log_retention_days   = 7
