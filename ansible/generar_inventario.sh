#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Regenera inventory.ini con las instancias EC2 en ejecución del Auto Scaling Group.
# Filtra por el tag aws:autoscaling:groupName que AWS agrega a cada instancia del ASG.
#
# Uso:
#   ./generar_inventario.sh                      # lee los datos de terraform output
#   ASG_NAME=mi-asg AWS_REGION=us-east-1 ARTIFACT_BUCKET=mi-bucket ./generar_inventario.sh
# -----------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"
TF_DIR="../terraform"
OUT="inventory.ini"

tf_output() {
  terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true
}

ASG_NAME="${ASG_NAME:-$(tf_output asg_name)}"
AWS_REGION="${AWS_REGION:-$(tf_output aws_region)}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-$(tf_output artifacts_bucket)}"
SSM_PREFIX="${SSM_PREFIX:-$(tf_output ssm_parameter_prefix)}"
SSM_PREFIX="${SSM_PREFIX:-/rtlco}"

if [[ -z "$ASG_NAME" || -z "$AWS_REGION" || -z "$ARTIFACT_BUCKET" ]]; then
  echo "ERROR: faltan datos. Ejecuta 'terraform apply' o define ASG_NAME, AWS_REGION y ARTIFACT_BUCKET." >&2
  exit 1
fi

echo "Buscando instancias del ASG '$ASG_NAME' en $AWS_REGION..."
INSTANCES=$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --filters "Name=tag:aws:autoscaling:groupName,Values=$ASG_NAME" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[InstanceId,Placement.AvailabilityZone,PrivateIpAddress]' \
  --output text)

if [[ -z "$INSTANCES" ]]; then
  echo "ERROR: no hay instancias en ejecución en el ASG '$ASG_NAME'." >&2
  exit 1
fi

# Aviso si alguna instancia aún no aparece registrada en SSM (el agente tarda ~1-2 min).
# shellcheck disable=SC2016  # los backticks son literales de JMESPath, no del shell
ONLINE=$(aws ssm describe-instance-information --region "$AWS_REGION" \
  --query 'InstanceInformationList[?PingStatus==`Online`].InstanceId' --output text || true)

{
  echo "# Generado por generar_inventario.sh el $(date -u +'%Y-%m-%dT%H:%M:%SZ') — no editar a mano."
  echo "# ASG: $ASG_NAME · región: $AWS_REGION · conexión: SSM Session Manager"
  echo
  echo "[gestor_documental]"
  while read -r ID AZ IP; do
    [[ -z "$ID" ]] && continue
    echo "$ID az=$AZ private_ip=$IP"
    if [[ " $ONLINE " != *" $ID "* ]]; then
      echo "AVISO: $ID todavía no está 'Online' en SSM; espera un momento antes de ejecutar Ansible." >&2
    fi
  done <<< "$INSTANCES"
  echo
  echo "[gestor_documental:vars]"
  echo "ansible_connection=amazon.aws.aws_ssm"
  echo "ansible_aws_ssm_region=$AWS_REGION"
  echo "ansible_aws_ssm_bucket_name=$ARTIFACT_BUCKET"
  echo "ansible_aws_ssm_s3_addressing_style=virtual"
  echo "ansible_python_interpreter=/usr/bin/python3"
  echo
  echo "[all:vars]"
  echo "aws_region=$AWS_REGION"
  echo "ssm_parameter_prefix=$SSM_PREFIX"
  echo "asg_name=$ASG_NAME"
} > "$OUT"

COUNT=$(grep -c '^i-' "$OUT")
echo "Inventario escrito en ansible/$OUT con $COUNT instancia(s)."
