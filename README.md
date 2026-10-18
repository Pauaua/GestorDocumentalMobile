# RTLCO

Plataforma para que los colegios publiquen, distribuyan y respalden sus documentos oficiales (citaciones, actas,
oficios, memos, permisos) con **acuse de recibo**, avisos por correo y push, y control de acceso por rol.
Funciona como servicio para muchos colegios (multi-tenant) en web, iOS y Android.

| Carpeta | Contenido |
|---|---|
| `backend/` | API REST (Node 20, Express 5, Prisma, PostgreSQL, S3) y pruebas Jest |
| `app/` | App Expo (React Native + web) |
| `terraform/` | Infraestructura AWS (VPC, ALB, ASG, RDS, S3, SES, CloudWatch); perfiles de costo en `perfiles/` |
| `ansible/` | Despliegue en las EC2 por SSM |
| `tests/` | Pruebas de interfaz (Selenium), carga (JMeter) y tolerancia a fallos |
| `docs/` | [Costos](docs/costos.md) y [kit de cumplimiento Ley 21.719](docs/legal/README.md) |

## Funcionalidades

- **Multi-colegio:** cada colegio entra por su subdominio (`demo.rtlco.cl`) o, en la app, con su código. Una
  cuenta puede pertenecer a varios colegios con un rol distinto en cada uno; el sostenedor de una red administra
  todos sus colegios. Consola de RTLCO en `/plataforma` (alta y suspensión de colegios, planes y redes; sin acceso
  a documentos).
- **Documentos:** subida directa a S3, clasificación, búsqueda y filtros; audiencia por rol, por persona o por
  curso (los apoderados de sus estudiantes).
- **Acuse de recibo:** registro de apertura y confirmación explícita, con informe por documento para la dirección.
- **Avisos:** bandeja en la app, correo (Amazon SES) y push (Expo), con outbox y reintentos; cada persona puede
  desactivar los correos.
- **Importación masiva** desde CSV (personas, o estudiantes con apoderados y cursos) con vista previa por fila.
- **Cuentas:** invitaciones y recuperación de contraseña por correo con enlaces de un solo uso.
- **Bitácora de auditoría** y **exportación de datos personales** (derecho de acceso y portabilidad).

## Desarrollo local

```bash
cd backend
cp .env.example .env            # DEFAULT_SCHOOL_SLUG=demo para no indicar colegio en cada solicitud
docker compose up -d            # PostgreSQL + S3 local (RustFS)
npm install && npm run s3:init
npx prisma migrate deploy && npm run seed
npm run dev                     # API en http://localhost:3000

cd ../app
cp .env.example .env            # EXPO_PUBLIC_SCHOOL=demo
npm install && npx expo start
```

En la web también puedes abrir `http://demo.localhost:3000` (con la web exportada en `WEB_DIST_DIR`): el colegio se
toma del subdominio.

**Usuarios de demostración** (contraseña `Rtlco2026`): `director@rtlco.cl`, `utp@rtlco.cl` (equipo directivo),
`docente@rtlco.cl` (en dos colegios), `apoderado@rtlco.cl`, `apoderado2@rtlco.cl`, `sostenedor@rtlco.cl`
(sostenedor de la red), `director.norte@rtlco.cl` (colegio `demo-norte`) y `admin@rtlco.cl` (consola de plataforma).

## Pruebas

```bash
cd backend && npm test                        # API: PostgreSQL embebido, sin Docker
cd tests && pytest selenium_test_gestor_documental.py --base-url http://demo.localhost:3000
```

## Despliegue

1. `cd backend && npm run build:artifact` (genera `ansible/files/gestor-documental.tar.gz`). Para la web con
   subdominios: `EXPO_PUBLIC_BASE_DOMAIN=rtlco.cl npm run build:artifact`.
2. `cd terraform && terraform apply -var-file=perfiles/economico.tfvars -var-file=terraform.tfvars`
   - `tenant_base_domain = "rtlco.cl"`: certificado y DNS comodín `*.rtlco.cl`.
   - `mail_from_domain = "rtlco.cl"`: SES con DKIM. Una cuenta nueva de SES está en *sandbox*: solicita acceso de
     producción para enviar a cualquier correo.
3. `cd ansible && ./generar_inventario.sh && ansible-playbook playbook.yml` (aplica las migraciones).

**Push en la app:** requiere un development build y vincular el proyecto a EAS (`npx eas-cli@latest init`, que
agrega `extra.eas.projectId` a `app.json`). Sin eso, los avisos llegan igual a la bandeja y por correo.
