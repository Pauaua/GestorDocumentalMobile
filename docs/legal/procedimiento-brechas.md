# Procedimiento ante brechas de seguridad

> Borrador para revisión legal. Verifica en la ley y en las instrucciones de la Agencia los plazos y el
> contenido exigido para las notificaciones.

Una **brecha** es cualquier incidente que provoque la destrucción, pérdida, alteración, comunicación o acceso no
autorizado a datos personales: una cuenta comprometida, un documento visible para quien no debía, un error de
configuración o la pérdida de un respaldo.

## Roles

| Rol | Persona | Contacto |
|---|---|---|
| Coordinador(a) de incidentes RTLCO | [nombre] | [teléfono, correo] |
| Responsable técnico | [nombre] | [teléfono, correo] |
| Contacto de privacidad de cada colegio | Ver la ficha del colegio en la consola | — |

## 1. Detectar y registrar (de inmediato)

Fuentes: alarmas de CloudWatch, la bitácora de auditoría (picos de `auth.login_failed`, cambios masivos),
avisos de usuarios o de un colegio.

Abrir un registro del incidente con: hora de detección, quién lo detectó, qué se observó y qué sistemas
están afectados. Todo lo que sigue se anota con hora.

## 2. Contener (primeras horas)

| Situación | Acción en RTLCO |
|---|---|
| Cuenta comprometida | Desactivarla o cambiar su contraseña (cierra todas sus sesiones). |
| Robo de tokens | Rotar `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` en SSM y redesplegar: cierra todas las sesiones de la plataforma. |
| Documento expuesto a una audiencia equivocada | Corregir la visibilidad o archivarlo; revisar en el acuse de recibo y en el registro de descargas quién lo abrió. |
| Colegio en riesgo | Suspenderlo desde la consola de la plataforma (cierra sus sesiones). |
| Credenciales de AWS expuestas | Revocarlas, revisar CloudTrail y rotar las claves de la base de datos. |

Conservar la evidencia: no borrar logs ni registros de la bitácora; exportar los eventos relevantes.

## 3. Evaluar (dentro de las primeras [24] horas)

- ¿Qué datos y de cuántas personas? ¿Hay datos de estudiantes o datos sensibles?
- ¿Qué riesgo implica para las personas (suplantación, discriminación, daño reputacional)?
- ¿Sigue activo el incidente?

La bitácora y los registros de acuses y descargas permiten responder quién accedió a qué y cuándo.

## 4. Notificar

| A quién | Quién notifica | Cuándo |
|---|---|---|
| Colegio (responsable) | RTLCO | Sin dilación indebida y a más tardar en [24] horas desde que se conoce la brecha. |
| Agencia de Protección de Datos Personales | El colegio, con apoyo de RTLCO | Según la ley, sin dilaciones indebidas cuando exista un riesgo razonable para los titulares. [Confirmar plazo.] |
| Personas afectadas | El colegio, con apoyo de RTLCO | Cuando el riesgo sea alto o lo exija la ley, en lenguaje claro y con recomendaciones. |

Contenido mínimo: naturaleza de la brecha, datos y número aproximado de personas afectadas, consecuencias
probables, medidas adoptadas y contacto para más información.

## 5. Cerrar y aprender

- Informe final: causa raíz, cronología, impacto y medidas.
- Acciones preventivas con responsable y fecha.
- Actualizar este procedimiento y las [medidas de seguridad](medidas-seguridad.md) si corresponde.
