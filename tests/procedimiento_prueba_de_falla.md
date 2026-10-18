# Bitácora de pruebas de tolerancia a fallos

**Proyecto:** RTLCO · Gestor documental escolar
**Arquitectura bajo prueba:** Route 53 → ALB (subredes públicas) → ASG EC2 (subredes privadas, 2 AZ) → RDS PostgreSQL Multi-AZ (subredes aisladas) · S3 por VPC Endpoint

| Campo | Valor |
|---|---|
| Ejecutado por | _(nombre)_ |
| Fecha | _(AAAA-MM-DD)_ |
| Región / cuenta | _(us-east-1 / 123456789012)_ |
| URL pública | _(salida `public_url` de Terraform)_ |
| Versión desplegada | _(campo `version` de `/health`)_ |

> **Estado:** procedimiento listo y validado en su sintaxis. Las columnas **"Medido"** se completan al ejecutarlo
> sobre la infraestructura real en AWS (no existe un equivalente local de ALB/ASG/RDS Multi-AZ). Los valores
> **"Esperado"** provienen de la configuración de Terraform y de la documentación de AWS.

---

## 0. Preparación común

### Variables de entorno

```bash
cd terraform
export AWS_REGION=$(terraform output -raw aws_region)
export URL=$(terraform output -raw public_url)
export ASG=$(terraform output -raw asg_name)
export TG_ARN=$(terraform output -raw target_group_arn)
export DB_ID=$(terraform output -raw rds_instance_id)
export SNS_ARN=$(terraform output -raw sns_topic_arn)
cd ..
```

### Monitor de disponibilidad (dejar corriendo en otra terminal durante cada prueba)

Consulta `/health` cada segundo y registra hora, código HTTP, instancia que respondió y estado de la BD.
Al terminar (Ctrl+C) imprime el total de fallas y la ventana de indisponibilidad.

```bash
#!/usr/bin/env bash
# monitor_health.sh — uso: ./monitor_health.sh "$URL" | tee monitor_$(date +%H%M%S).log
URL="$1"; FALLAS=0; PRIMERA=""; ULTIMA=""
trap 'echo; echo "Fallas: $FALLAS · primera: ${PRIMERA:-—} · última: ${ULTIMA:-—}"; exit 0' INT
while true; do
  T=$(date +%H:%M:%S)
  R=$(curl -s -m 3 -w ' %{http_code}' "$URL/health" || echo ' 000')
  CODE=${R##* }
  INST=$(echo "$R" | grep -o '"instanceId":"[^"]*"' | cut -d'"' -f4)
  DB=$(echo "$R" | grep -o '"database":"[^"]*"' | cut -d'"' -f4)
  echo "$T $CODE ${INST:--} db=${DB:--}"
  if [[ "$CODE" != "200" ]]; then FALLAS=$((FALLAS+1)); PRIMERA=${PRIMERA:-$T}; ULTIMA=$T; fi
  sleep 1
done
```

### Estado inicial (evidencia "antes")

```bash
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
  --query 'AutoScalingGroups[0].Instances[].[InstanceId,AvailabilityZone,LifecycleState,HealthStatus]' --output table

aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output table

aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
  --query 'DBInstances[0].[DBInstanceStatus,MultiAZ,AvailabilityZone,SecondaryAvailabilityZone]' --output table
```

Precondición general: 2 instancias `InService`/`Healthy` en AZ distintas, 2 targets `healthy`, RDS `available`
con `MultiAZ = True`, suscripción SNS **confirmada** (correo "AWS Notification - Subscription Confirmation").

---

## Prueba 1 — Terminar una instancia EC2

**Objetivo:** demostrar que el ALB deja de enviar tráfico a una instancia caída y que el Auto Scaling Group
la reemplaza automáticamente, sin interrumpir el servicio.

**Precondiciones:** estado inicial correcto; monitor de disponibilidad corriendo.

**Pasos y comandos:**

1. Elegir una instancia en servicio y anotar la hora (T0):
   ```bash
   VICTIMA=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
     --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`]|[0].InstanceId' --output text)
   echo "Terminando $VICTIMA a las $(date +%H:%M:%S)"
   ```
2. Terminarla **sin** decrementar la capacidad deseada (así el ASG debe reponerla):
   ```bash
   aws ec2 terminate-instances --instance-ids "$VICTIMA"
   ```
3. Observar el Target Group hasta que la víctima salga (`draining` → desaparece):
   ```bash
   watch -n 5 "aws elbv2 describe-target-health --target-group-arn $TG_ARN \
     --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output text"
   ```
4. Observar la actividad del ASG (evento de reemplazo):
   ```bash
   aws autoscaling describe-scaling-activities --auto-scaling-group-name "$ASG" --max-items 3 \
     --query 'Activities[].[StartTime,StatusCode,Description]' --output table
   ```
5. Esperar a que la nueva instancia quede `healthy` en el Target Group (user data: Node + artefacto + migraciones).

**Evidencia esperada:**

- El monitor sigue respondiendo `200` desde la instancia sobreviviente (el `instanceId` deja de alternar).
- `describe-target-health`: la víctima pasa a `draining` y desaparece; aparece un target nuevo `initial` → `healthy`.
- `describe-scaling-activities`: _"Launching a new EC2 instance ... in response to an instance that was terminated / unhealthy"_.
- En el dashboard de CloudWatch: "Instancias en servicio" baja a 1 y vuelve a 2.
- Alarma `rtlco-tg-sin-hosts-saludables` puede pasar a `ALARM` mientras hay 1 instancia (correo SNS).

**Tiempos:**

| Métrica | Esperado | Medido |
|---|---|---|
| Solicitudes fallidas en el monitor | 0 (a lo sumo 1–2 en conexiones abiertas a la víctima) | |
| T0 → víctima fuera del Target Group | < 35 s (deregistration delay 30 s) | |
| T0 → ASG lanza la instancia de reemplazo | < 90 s | |
| T0 → reemplazo `healthy` en el ALB | 4–7 min (arranque + npm ci + 2 health checks de 15 s) | |

**Conclusiones:** _(completar: ¿hubo cortes?, ¿el reemplazo quedó en la AZ afectada?, lecciones)_

---

## Prueba 2 — Failover de RDS Multi-AZ

**Objetivo:** forzar el cambio de la instancia primaria de PostgreSQL a la réplica standby en la otra AZ y
medir el tiempo de indisponibilidad de la base de datos percibido por la aplicación.

**Precondiciones:** RDS `available` y `MultiAZ = True`; monitor de disponibilidad corriendo (el campo `db=` muestra
`ok`/`error` porque `/health` ejecuta `SELECT 1`).

**Pasos y comandos:**

1. Anotar la AZ primaria actual:
   ```bash
   aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
     --query 'DBInstances[0].[AvailabilityZone,SecondaryAvailabilityZone]' --output text
   ```
2. Forzar el failover (reinicio con conmutación) y anotar T0:
   ```bash
   date +%H:%M:%S && aws rds reboot-db-instance --db-instance-identifier "$DB_ID" --force-failover
   ```
3. Seguir el estado hasta `available`:
   ```bash
   aws rds wait db-instance-available --db-instance-identifier "$DB_ID" && date +%H:%M:%S
   ```
4. Revisar los eventos de RDS:
   ```bash
   aws rds describe-events --source-identifier "$DB_ID" --source-type db-instance --duration 30 \
     --query 'Events[].[Date,Message]' --output table
   ```
5. Confirmar que la AZ primaria cambió (repetir el paso 1).
6. Verificar funcionalmente: iniciar sesión en la app y abrir un documento (o ejecutar CP-01 y CP-06 de Selenium).

**Evidencia esperada:**

- Eventos: _"Multi-AZ instance failover started"_ y _"Multi-AZ instance failover completed"_.
- `AvailabilityZone` y `SecondaryAvailabilityZone` intercambiadas.
- En el monitor: un tramo con `503 db=error` (la app sigue viva; `/health` responde 503 porque la BD no contesta);
  cuando todas las instancias están en 503 el ALB aplica *fail-open* y sigue enrutando. Luego vuelve `200 db=ok`
  sin reiniciar la app (Prisma reconecta: el endpoint DNS de RDS apunta a la nueva primaria).
- El ASG **no** debería reemplazar instancias (el periodo es menor a 2 health checks consecutivos + gracia);
  si el corte es largo, anotar si ocurrió.

**Tiempos:**

| Métrica | Esperado | Medido |
|---|---|---|
| T0 → primer `db=error` | 5–15 s | |
| Ventana de indisponibilidad de la BD (primer → último `db=error`) | 60–120 s (típico de RDS Multi-AZ) | |
| T0 → `available` (`aws rds wait`) | 1–3 min | |
| Pérdida de datos | Ninguna (réplica síncrona) | |

**Conclusiones:** _(completar)_

---

## Prueba 3 — Notificaciones de alarmas por SNS

**Objetivo:** verificar que las alarmas de CloudWatch publican en el tópico SNS y que el correo configurado
(`alert_email`) recibe la notificación de `ALARM` y de vuelta a `OK`.

**Precondiciones:** suscripción SNS en estado `Confirmed`:
```bash
aws sns list-subscriptions-by-topic --topic-arn "$SNS_ARN" \
  --query 'Subscriptions[].[Protocol,Endpoint,SubscriptionArn]' --output table
```

**Pasos y comandos:**

1. **Prueba directa del tópico:**
   ```bash
   aws sns publish --topic-arn "$SNS_ARN" --subject "Prueba SNS Gestor Documental" \
     --message "Mensaje de prueba de la bitácora de fallas $(date -Is)"
   ```
2. **Forzar una alarma real** (cambia el estado de forma temporal; CloudWatch la reevalúa en el siguiente periodo):
   ```bash
   aws cloudwatch set-alarm-state --alarm-name rtlco-alb-errores-5xx \
     --state-value ALARM --state-reason "Prueba de notificacion (bitacora de fallas)"
   ```
3. **Alarma por evento real:** durante la Prueba 1 o 2 revisar el historial:
   ```bash
   aws cloudwatch describe-alarm-history --alarm-name rtlco-tg-hosts-no-saludables \
     --history-item-type StateUpdate --max-records 5 \
     --query 'AlarmHistoryItems[].[Timestamp,HistorySummary]' --output table
   ```
4. Revisar la bandeja del correo configurado.

**Evidencia esperada:**

- Correo con asunto _"Prueba SNS Gestor Documental"_ (paso 1).
- Correo _"ALARM: \"rtlco-alb-errores-5xx\" in US East (N. Virginia)"_ y luego _"OK: ..."_ cuando CloudWatch
  reevalúa la métrica (≈ 5 min) (paso 2).
- Historial de la alarma con transiciones `OK → ALARM → OK`.

**Tiempos:**

| Métrica | Esperado | Medido |
|---|---|---|
| `sns publish` → correo recibido | < 1 min | |
| `set-alarm-state` → correo ALARM | < 1 min | |
| Correo de vuelta a OK | ≈ 5 min (siguiente evaluación) | |
| Terminar EC2 → correo `tg-hosts-no-saludables` | 2–3 min (2 periodos de 60 s) | |

**Conclusiones:** _(completar)_

---

## Resumen

| Prueba | Resultado | Indisponibilidad medida | Observaciones |
|---|---|---|---|
| 1. Terminar instancia EC2 | ☐ Aprobada ☐ Rechazada | | |
| 2. Failover RDS Multi-AZ | ☐ Aprobada ☐ Rechazada | | |
| 3. Alarmas por SNS | ☐ Aprobada ☐ Rechazada | | |

**Criterio de aprobación:** (1) sin errores visibles para el usuario y reemplazo automático de la instancia;
(2) recuperación automática de la BD sin intervención ni pérdida de datos; (3) llegada de las notificaciones.
