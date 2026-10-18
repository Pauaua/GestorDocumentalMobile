# Registro de actividades de tratamiento (RAT)

> Borrador para revisión legal. Una copia por colegio; RTLCO mantiene la parte que le corresponde como encargado.
> Los plazos de conservación son una propuesta inicial: los define el colegio según sus obligaciones.

**Responsable:** [Colegio] · **Encargado:** RTLCO · **Fecha:** [fecha] · **Revisión:** anual o ante cambios relevantes.

| # | Actividad | Titulares | Datos | Finalidad | Base de licitud | Destinatarios | Conservación propuesta | Dónde está en el sistema |
|---|---|---|---|---|---|---|---|---|
| 1 | Gestión de cuentas | Comunidad educativa con cuenta | Nombre, RUT, correo, teléfono, rol, estado | Dar acceso a la plataforma según el rol | Funciones del colegio / contrato | Dirección y sostenedor del colegio | Mientras exista la relación + [1 año] | `users`, `memberships` |
| 2 | Vínculo apoderado-estudiante | Apoderados y estudiantes | Nombre, RUT y curso del estudiante; parentesco | Dirigir documentos a los apoderados correctos | Funciones del colegio | Equipo directivo | Año escolar vigente + [1 año] | `students`, `courses`, `guardian_students` |
| 3 | Publicación y distribución de documentos | Destinatarios y personas mencionadas en los documentos | Contenido de los documentos y sus metadatos | Comunicaciones oficiales del colegio | Funciones y obligaciones legales del colegio | Solo la audiencia definida por el colegio | Según el tipo de documento: [actas X años, citaciones X años, …] | `documents`, archivos en S3 |
| 4 | Acuse de recibo | Destinatarios | Fecha de apertura y confirmación, IP, navegador | Constancia de recepción ante reclamos o fiscalización | Interés legítimo / funciones del colegio | Equipo directivo | Igual que el documento | `document_receipts` |
| 5 | Registro de descargas | Quienes descargan | Fecha, IP, documento | Trazabilidad y seguridad | Interés legítimo | Equipo directivo | Igual que el documento | `download_logs` |
| 6 | Avisos | Destinatarios | Correo, token del teléfono, título del documento | Avisar documentos nuevos | Funciones del colegio; consentimiento para el correo (desactivable) | AWS SES, Expo Push (subencargados) | Bandeja: [1 año]; envíos: [90 días] | `notifications`, `notification_deliveries`, `push_tokens` |
| 7 | Seguridad y auditoría | Personas con cuenta y quienes intentan entrar | Accesos, intentos fallidos (correo usado), cambios, IP | Seguridad, investigación de incidentes, rendición de cuentas | Interés legítimo / obligación de seguridad | Dirección y sostenedor; RTLCO ante incidentes | [2 años] | `audit_events`, CloudWatch Logs (14 días) |
| 8 | Recuperación de contraseña e invitaciones | Personas con cuenta | Correo, enlace de un solo uso (solo su hash) | Activar cuentas y recuperar acceso | Ejecución del servicio | — | Enlaces: hasta su uso o vencimiento (1 h / 7 días) | `account_tokens`, `outbound_emails` |

## Ubicación y transferencias

- Base de datos (Amazon RDS) y archivos (Amazon S3): región [us-east-1], cifrados en reposo.
- Correo: Amazon SES, misma región. Push: Expo (EE. UU.), solo título del aviso e identificadores.

## Pendiente técnico

- Las tablas aún no tienen eliminación automática por plazo: cuando el colegio defina los plazos, se
  programará una tarea de expurgo (documentos archivados, avisos, bitácora) y quedará registrada en la bitácora.
