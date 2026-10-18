# Costos de infraestructura de RTLCO

> Estimaciones con precios de lista de AWS en `us-east-1` (on-demand, sin impuestos), para orientar precios y
> decisiones. Verifica con la [calculadora de AWS](https://calculator.aws/) antes de comprometer un precio.

Desde el paso 1 de la ruta (multi-tenant), **una sola infraestructura atiende a todos los colegios**: el costo ya
no se multiplica por cliente.

## Perfiles

| Componente | Económico (`perfiles/economico.tfvars`) | Alta disponibilidad (`perfiles/alta-disponibilidad.tfvars`) |
|---|---:|---:|
| Balanceador (ALB) | ~18 | ~18 |
| EC2 (t3.small) | 1 × ~15 | 2 × ~15 |
| NAT Gateway | — | ~33 + tráfico |
| RDS PostgreSQL | db.t4g.micro, una zona: ~12 | db.t4g.small Multi-AZ: ~47 |
| Almacenamiento RDS (20 GB) | ~2 | ~5 |
| S3, CloudWatch, SSM, Route 53 | ~5 | ~8 |
| **Total mensual aprox. (USD)** | **~50–60** | **~140–170** |

### Variables (por uso)

| Concepto | Precio de referencia | Ejemplo: 100 colegios |
|---|---|---|
| Correos (SES) | ~USD 0,10 por 1.000 | 100 colegios × 500 familias × 8 avisos/mes = 400.000 correos ≈ USD 40 |
| Push (Expo) | Sin costo en el volumen esperado | — |
| Almacenamiento S3 | ~USD 0,023 por GB/mes | 100 colegios × 2 GB = 200 GB ≈ USD 5 |
| Transferencia de descargas | ~USD 0,09 por GB | 100 GB/mes ≈ USD 9 |

## Cuándo cambiar de perfil

- **Empezar en el económico** con los primeros colegios piloto. Una falla de zona deja el servicio caído
  algunos minutos mientras el ASG y RDS se recuperan; es aceptable para un servicio que no es de tiempo real.
- **Pasar a alta disponibilidad** cuando se firme un contrato con un nivel de servicio exigible, al vender
  el plan "red" o al superar unos 30 colegios.
- **Instancias reservadas o Savings Plans** (1 año): bajan ~30–40 % EC2 y RDS una vez estable la carga.

## Lectura económica

Con el perfil económico y 30 colegios a CLP 45.000/mes (unos USD 1.400), la infraestructura es menos del 5 %
del ingreso. El margen depende sobre todo del soporte y de la venta, no del servidor.
