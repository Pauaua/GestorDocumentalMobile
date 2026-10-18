# Perfil de alta disponibilidad (plan "red" o cuando haya decenas de colegios): ~USD 140-170 al mes.
# Uso: terraform apply -var-file=perfiles/alta-disponibilidad.tfvars -var-file=terraform.tfvars
enable_nat_gateway       = true
single_nat_gateway       = true # false: un NAT por AZ (+~USD 33/mes) si la salida a internet también debe ser redundante
instance_type            = "t3.small"
asg_min_size             = 2
asg_desired_capacity     = 2
asg_max_size             = 6
db_instance_class        = "db.t4g.small"
db_multi_az              = true
db_deletion_protection   = true
db_skip_final_snapshot   = false
db_backup_retention_days = 14
log_retention_days       = 30
s3_force_destroy         = false
