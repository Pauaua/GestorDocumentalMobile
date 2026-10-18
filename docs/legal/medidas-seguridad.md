# Medidas de seguridad de RTLCO

> Anexo técnico del contrato de encargo. Cada medida indica dónde está implementada, para poder demostrarla.

## Acceso y autorización

| Medida | Implementación |
|---|---|
| Aislamiento entre colegios | Cada solicitud se resuelve a un colegio (subdominio o `X-School`); todas las consultas filtran por colegio; un token de un colegio no sirve en otro. Probado en `backend/tests/tenants.test.ts`. |
| Mínimo privilegio por rol | Docentes y apoderados ven solo lo dirigido a su rol, a ellos o a los cursos de sus estudiantes; las reglas se aplican en el servidor (`backend/src/modules/documents/access.ts`). |
| El proveedor no ve documentos | La consola de RTLCO solo administra colegios y planes; no tiene acceso a documentos (`platform.routes.ts`, probado). |
| Contraseñas | bcrypt (12 rondas), mínimo 8 caracteres con letras y números, comparación en tiempo constante aunque la cuenta no exista. |
| Sesiones | Token de acceso de 15 minutos; token de renovación rotativo, con detección de reutilización (revoca todas las sesiones); cookie `httpOnly` + `SameSite=Strict` en la web; llavero del sistema en el teléfono. |
| Cierre de sesiones | Al cambiar la contraseña, al desactivar una cuenta o al suspender un colegio. |
| Fuerza bruta | Límite de intentos fallidos por IP + colegio + correo; límite de solicitudes de recuperación por IP. |
| Enlaces de un solo uso | Invitaciones (7 días) y recuperación (1 hora): solo se guarda su hash SHA-256 y un enlace nuevo invalida el anterior. |

## Protección de los datos

| Medida | Implementación |
|---|---|
| Cifrado en tránsito | HTTPS (TLS 1.2+ con ACM en el balanceador); el bucket rechaza conexiones sin TLS. |
| Cifrado en reposo | RDS cifrado; S3 con cifrado del lado del servidor; volúmenes EBS cifrados. |
| Archivos | El servidor nunca expone el bucket: subidas y descargas con URL firmadas de 5 minutos, con tipo y tamaño firmados; cada usuario sube bajo el prefijo de su colegio. |
| Red | Base de datos en subredes aisladas sin ruta a internet; servidores en subredes privadas; acceso de operación por SSM (sin SSH). |
| Secretos | Credenciales de base de datos y claves JWT en SSM Parameter Store (SecureString); los servidores las leen con su rol IAM, nunca quedan en disco. |
| Correos | Sin el contenido de los documentos: solo el aviso y un enlace que exige iniciar sesión. |

## Disponibilidad y respaldo

| Medida | Implementación |
|---|---|
| Alta disponibilidad | Balanceador + grupo de autoescalado en 2 zonas; RDS Multi-AZ (plan superior). |
| Respaldos | Respaldos automáticos de RDS ([7] días); versionado de S3 (las versiones anteriores se conservan 180 días). |
| Borrado lógico | Eliminar un documento lo oculta pero conserva el archivo por trazabilidad. |
| Monitoreo | Alarmas de CloudWatch (errores 5xx, latencia, hosts no saludables, CPU, conexiones y almacenamiento de la base) con aviso por correo. |

## Trazabilidad

| Medida | Implementación |
|---|---|
| Bitácora de auditoría | Inicios de sesión (y fallidos), cambios de contraseña, altas y cambios de usuarios, publicación, edición (con la audiencia anterior y la nueva) y eliminación de documentos, confirmaciones, importaciones y exportaciones de datos. Consultable por dirección y sostenedor. |
| Acuses y descargas | Fecha, IP y navegador de cada apertura, confirmación y descarga. |
| Logs | Logs estructurados de la aplicación en CloudWatch (14 días). |

## Organizativas (por completar)

- [ ] Acuerdo de confidencialidad firmado por todo el personal de RTLCO.
- [ ] Acceso a producción solo para [personas designadas], con MFA en la cuenta de AWS.
- [ ] Revisión trimestral de accesos y de alarmas.
- [ ] Prueba anual de restauración de respaldos y del [procedimiento ante brechas](procedimiento-brechas.md).
