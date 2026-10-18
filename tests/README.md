# Pruebas del Gestor Documental

| Archivo | Qué es |
|---|---|
| `selenium_test_gestor_documental.py` | 10 casos funcionales (Selenium 4 + pytest + Chrome headless) |
| `conftest.py` | Navegador, opciones (`--base-url`) y registro de trazabilidad |
| `resultados_pruebas_funcionales.json` | Resultado por caso: id, requisito, rol, pasos, esperado, obtenido, estado, duración y timestamp |
| `prueba_carga_cyberday.jmx` | Plan de Apache JMeter (peak "cyberday") |
| `usuarios_carga.csv` | Usuarios del seed que usa JMeter |
| `resultados_carga_cyberday.jtl` | Registro crudo de cada solicitud de JMeter |
| `informe_html/` | Dashboard HTML generado por JMeter (abrir `index.html`) |
| `procedimiento_prueba_de_falla.md` | Bitácora de tolerancia a fallos (EC2, RDS Multi-AZ, SNS) |

## Pruebas funcionales (Selenium)

```bash
cd tests
pip install -r requirements.txt
pytest selenium_test_gestor_documental.py -v --base-url "$(terraform -chdir=../terraform output -raw public_url)"
# local: pytest selenium_test_gestor_documental.py --base-url http://localhost:3000
```

Colegio: con un subdominio (`https://demo.rtlco.cl`) se toma del host; contra el DNS del ALB el login pide el
código y se usa `SCHOOL` (por defecto `demo`, el colegio del seed).

Requisitos: Google Chrome instalado (Selenium Manager descarga el chromedriver correcto) y el seed cargado
(`ansible-playbook playbook.yml -t seed -e run_seed=true`). Si un caso falla se guarda una captura en `evidencias/`.

| Caso | Requisito | Rol |
|---|---|---|
| CP-01 | Login correcto | director |
| CP-02 | Login incorrecto | director |
| CP-03 | Subir, clasificar y almacenar (S3 + RDS) | director |
| CP-04 | Búsqueda por texto | director |
| CP-05 | Filtros por tipo y fecha | equipo directivo |
| CP-06 | Descarga autorizada + registro de descargas | apoderado |
| CP-07 | Apoderado **no** ve ni descarga lo no autorizado (UI + API 403) | apoderado |
| CP-08 | Docente solo ve lo que le corresponde | docente |
| CP-09 | Logout y revocación de sesión | equipo directivo |
| CP-10 | Acuse de recibo: la apoderada confirma y la dirección lo ve en el informe | apoderado |

## Prueba de carga "cyberday" (JMeter)

Flujo por usuario virtual: **login → listar documentos → ver detalle → pedir URL de descarga**, con think time
aleatorio, aserciones de código 200, JSONPath (paginación, id, presigned URL de 5 min) y SLA por solicitud.

```bash
cd tests
rm -rf informe_html resultados_carga_cyberday.jtl
jmeter -n -t prueba_carga_cyberday.jmx -l resultados_carga_cyberday.jtl -e -o informe_html/ \
  -Jhost=<dns-del-alb-o-dominio> -Jport=80 -Jprotocol=http \
  -Jusuarios=200 -Jrampup=300 -Jduracion=900
# Con dominio y HTTPS: -Jhost=app.rtlco.cl -Jport=443 -Jprotocol=https
```

| Propiedad | Por defecto | Descripción |
|---|---|---|
| `host` / `port` / `protocol` | localhost / 3000 / http | Destino |
| `usuarios` | 100 | Usuarios concurrentes al final del ramp-up |
| `rampup` | 300 | Segundos para llegar a `usuarios` (subida progresiva) |
| `duracion` | 900 | Duración total (s) |
| `think_min` / `think_rango` | 1000 / 2000 | Pausa aleatoria entre pasos (ms) |
| `sla_ms` | 5000 | Tiempo máximo aceptado por solicitud |
| `school` | demo | Colegio (header `X-School`); con subdominio el servidor usa el host |

> JMeter genera toda la carga desde **una IP**. Antes de la prueba sube el límite de la API:
> `rate_limit_max = 20000` en `terraform.tfvars` y vuelve a desplegar con
> `ansible-playbook playbook.yml -t config -e rate_limit_max=20000`.

### Cómo observar el escalado del ASG durante la prueba

1. **Dashboard de CloudWatch** (`terraform output dashboard_url`): widgets *CPU promedio del ASG* (línea del
   objetivo 60 %), *Instancias (ASG y Target Group)*, *Solicitudes* y *Latencia p95*.
2. **Consola:** EC2 → Auto Scaling Groups → `rtlco-asg` → pestañas *Activity* y *Monitoring*.
3. **CLI** (en otra terminal mientras corre JMeter):
   ```bash
   ASG=$(terraform -chdir=../terraform output -raw asg_name)
   watch -n 15 "aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG \
     --query 'AutoScalingGroups[0].[DesiredCapacity,length(Instances)]' --output text; \
     aws autoscaling describe-scaling-activities --auto-scaling-group-name $ASG --max-items 3 \
     --query 'Activities[].[StartTime,StatusCode,Description]' --output text"
   ```
4. **Qué se espera:** al superar ~60 % de CPU promedio por unos minutos, la política *target tracking* sube
   `DesiredCapacity` (2 → 3 → … hasta 6). Las nuevas instancias quedan `healthy` en 4–7 min y la latencia p95
   baja. Al terminar la prueba, tras ~15 min bajo el objetivo, el ASG reduce de nuevo a 2.
5. **Evidencia:** captura del dashboard, salida de `describe-scaling-activities` y el `informe_html/`.

### Resultado de referencia incluido en el repositorio

El `.jtl` y el `informe_html/` versionados corresponden a una **ejecución local** (backend en un solo proceso
Node.js + PostgreSQL embebido + S3 local RustFS, en un PC con Windows), usada para validar el plan:

```
jmeter ... -Jhost=localhost -Jport=3100 -Jusuarios=40 -Jrampup=60 -Jduracion=180 -Jthink_min=500 -Jthink_rango=1500
```

| Transacción | Muestras | Error % | Media (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Solicitudes/s |
|---|---:|---:|---:|---:|---:|---:|---:|
| 01 Login | 568 | 0,0 | 2218 | 3577 | 3835 | 4120 | 3,17 |
| 02 Listar documentos | 555 | 0,0 | 1077 | 2125 | 2467 | 2891 | 3,15 |
| 03 Ver detalle | 547 | 0,0 | 1133 | 2149 | 2583 | 2982 | 3,12 |
| 04 Pedir URL de descarga | 541 | 0,0 | 1427 | 2635 | 3010 | 3513 | 3,10 |
| **Total** | **2211** | **0,0** | **1470** | **2911** | **3340** | **3936** | **12,33** |

Lectura: sin errores, pero con **un solo proceso** la CPU se satura con el login (bcrypt de 12 rondas es
intencionalmente costoso), lo que eleva las latencias de todo el flujo. Es exactamente el cuello de botella que
en AWS resuelve el ASG: la política de CPU al 60 % agrega instancias detrás del ALB. **Reemplaza estos archivos
con la ejecución contra AWS** para la entrega final.
