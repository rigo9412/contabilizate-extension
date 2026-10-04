# Ficha de Chrome Web Store: Contabilizate

## Paquete

`npm run package` → `contabilizate-<versión>.zip` (sin el campo `key`).

## Ficha de la tienda

**Nombre:** Contabilizate

**Resumen (máx. 132):**
Factura en el portal del SAT y lleva tus ingresos, gastos e impuestos. Gratis y privado: tus datos se quedan en tu navegador.

**Categoría:** Productividad → Herramientas (o "Productivity")

**Idioma:** Español (México)

**Descripción:**

Deja de cruzar facturas del SAT con estados de cuenta cada mes.

Contabilizate es una extensión gratuita para freelancers y pequeños negocios en México. Te ayuda a emitir tus facturas en el portal del SAT y convierte tus CFDI en un dashboard mes a mes.

QUÉ HACE
• Dashboard mensual con tus ingresos, gastos y margen real, calculados a partir de tus facturas.
• IVA trasladado y retenciones, ya calculados.
• Gastos con tarjeta de crédito: importa tus estados de cuenta en PDF.
• Llena por ti los formularios de facturación del portal del SAT e inicia sesión con tu e.firma.
• Descarga tus CFDI del SAT o importa los XML arrastrándolos.
• Plantillas de clientes y conceptos para facturar más rápido.
• Montos ocultos por defecto, para abrirla sin enseñar tus números.

TUS DATOS SON TUYOS
• 100% gratis: sin suscripciones, planes premium ni anuncios.
• Sin servidores: todo se procesa y se guarda en tu navegador. No hay cuentas ni rastreo.
• Nada se comparte con nadie. La extensión solo se comunica con el portal del SAT cuando tú facturas o descargas.
• Tu e.firma se guarda cifrada con su propia contraseña.
• Respaldo en un archivo, cifrado si quieres, para pasar tus datos a otro navegador.
• Código abierto: https://github.com/rigo9412/contabilizate-extension

Contabilizate es un proyecto independiente y no está afiliado al Servicio de Administración Tributaria (SAT) ni a ninguna institución bancaria.

**Sitio web:** https://rigo9412.github.io/contabilizate-extension/
**Soporte:** https://github.com/rigo9412/contabilizate-extension/issues

## Privacidad

**Propósito único:**
Ayudar a freelancers y pequeños negocios en México a administrar su facturación: emitir y descargar sus CFDI en el portal del SAT y llevar el control de los ingresos, gastos e impuestos que salen de esas facturas.

**Justificación de permisos:**

| Permiso | Justificación |
|---|---|
| `scripting` | Inyecta los scripts que llenan los formularios de inicio de sesión y de facturación del portal del SAT, y los que leen la lista de CFDI para descargarlos. Solo se ejecuta en páginas de sat.gob.mx. |
| `storage` | Guarda la e.firma desbloqueada en `storage.session` para que el script de inicio de sesión la use, y se borra al cerrar el navegador. También guarda las preferencias de la extensión. |
| `unlimitedStorage` | Las facturas (XML), los estados de cuenta y el historial se guardan localmente en IndexedDB. Un año de facturas puede superar el límite estándar. |
| `downloads` | Guarda en la computadora del usuario los XML y PDF de los CFDI que descarga del SAT, y los archivos de respaldo que exporta. |
| Permisos de host `https://*.sat.gob.mx/*` | Es el único sitio donde actúa la extensión: el portal de facturación y el inicio de sesión del SAT. Sirve para detectar esas páginas, llenar los formularios y descargar CFDI. |

**¿Usas código remoto?** No. Todo el código va dentro del paquete, incluido el worker de pdf.js.

**Uso de datos (marcar):**
- [x] Información financiera y de pago (facturas, montos, estados de cuenta)
- [x] Información de autenticación (e.firma y su contraseña, para iniciar sesión en el SAT)
- [x] Información de identificación personal (RFC, razón social, domicilio fiscal)

Certificaciones (marcar las tres):
- [x] No vendo ni transfiero datos de usuario a terceros, salvo en los casos de uso aprobados.
- [x] No uso ni transfiero datos de usuario para fines no relacionados con el propósito único del elemento.
- [x] No uso ni transfiero datos de usuario para determinar la solvencia crediticia ni para otorgar préstamos.

**Política de privacidad:** https://rigo9412.github.io/contabilizate-extension/privacy.html

## Recursos gráficos

- Ícono de 128×128: `128.png`
- Capturas de 1280×800 (mínimo 1, máximo 5). Sugeridas:
  1. Dashboard con los montos ocultos
  2. Dashboard con datos de ejemplo (sin datos reales)
  3. Lista de facturas
  4. Análisis de tarjetas
  5. Vista de privacidad / respaldo
- Opcional: mosaico promocional de 440×280

## Después de publicar

1. En el dashboard: Paquete → Ver clave pública. Copiarla en `manifest.json` → `key`.
2. Crear en Google Cloud el OAuth Client (tipo Extensión de Chrome) con el ID que asignó la tienda, y ponerlo en `oauth2.client_id`.
3. Publicar una versión nueva para activar la sincronización con Drive. Agregar en esta ficha la justificación de `identity`: "Iniciar sesión con Google para guardar un respaldo en la carpeta oculta de la app en el Google Drive del propio usuario (permiso `drive.appdata`)".
4. Cambiar el botón de la landing a "Agregar a Chrome" con el link de la tienda.
