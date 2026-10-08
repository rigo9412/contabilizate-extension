# Declaración mensual RESICO (persona física)

Guía de referencia para la pantalla **Declaración mensual** de la app y para el
llenado automático del portal de Declaraciones del SAT. Está escrita para quien
programa la extensión; el texto que ve el usuario vive en la app.

> **Aviso:** la extensión ayuda a calcular y a capturar, pero no sustituye a un
> contador. El envío de la declaración **siempre lo hace el usuario**.

## 1. Quién y cuándo

- Personas físicas en el **Régimen Simplificado de Confianza (régimen 626)** con
  actividad empresarial, servicios profesionales o arrendamiento.
- Se declara **cada mes**, a más tardar el **día 17 del mes siguiente**, más
  días hábiles según el **sexto dígito numérico del RFC** (facilidad para
  personas físicas): 1-2 → +1, 3-4 → +2, 5-6 → +3, 7-8 → +4, 9-0 → +5. La app
  salta fines de semana pero no días festivos (`dueDate`/`extraDays` en
  `app/src/lib/resico.ts`). Para que cuente como presentada, también debe
  pagarse a tiempo.
- Aunque no haya ingresos, se presenta en ceros.
- ISR e IVA se presentan en la **misma declaración** (dos obligaciones).

## 2. Regla base: flujo de efectivo

En RESICO los impuestos se causan **cuando se cobra** (ingresos) y se acreditan
**cuando se paga** (gastos). No importa la fecha de la factura sino la del dinero:

| CFDI | Cuándo cuenta | Importe |
| --- | --- | --- |
| Ingreso **PUE** emitido | Mes de la fecha de la factura | Bases e impuestos de la factura |
| Ingreso **PPD** emitido | Mes de la `FechaPago` de cada **complemento de pago** (CFDI tipo P) | `ImpuestosDR` del `DoctoRelacionado`; si no trae desglose (Pagos 1.0), proporcional a la factura |
| Nota de crédito (tipo E) emitida | Mes de su fecha | Resta a ingresos e IVA trasladado |
| Gasto **PUE** recibido | Mes de su fecha | Su IVA trasladado es **IVA acreditable** |
| Gasto **PPD** recibido | Mes del complemento que te emite el proveedor | IVA proporcional pagado |
| Nota de crédito recibida | Mes de su fecha | Resta IVA acreditable |
| Nómina (tipo N), canceladas, excluidas a mano (`count: false`) | No cuentan | — |

Los importes en otra moneda se convierten con `TipoCambio` del comprobante (o
`TipoCambioP`/`EquivalenciaDR` en el complemento).

Implementación: `cashFlows()` en `app/src/lib/resico.ts`; el complemento se lee
en `payments()` de `app/src/lib/cfdi-parser.ts` (`Bill.payments`).

## 3. ISR mensual

RESICO **no tiene deducciones**: se paga un porcentaje de lo cobrado, sin IVA.

```
Ingresos cobrados del mes (sin IVA, ya restados descuentos y notas de crédito)
× tasa de la tabla
= ISR mensual
− ISR retenido por personas morales (1.25 %)
= ISR a cargo   (si da negativo, es 0; la retención de más se recupera en la anual)
```

Tabla mensual (art. 113-E LISR):

| Ingresos del mes hasta | Tasa |
| ---: | ---: |
| $25,000.00 | 1.00 % |
| $50,000.00 | 1.10 % |
| $83,333.33 | 1.50 % |
| $208,333.33 | 2.00 % |
| $3,500,000.00 | 2.50 % |

- La tasa se aplica a **todo** el ingreso del mes (no es progresiva por tramos).
- El portal captura **pesos enteros**: menos de 50 centavos se redondea hacia
  abajo y 50 o más hacia arriba (`pesos()` en `sat-declaration.ts`).
- Si los ingresos del año pasan de **$3.5 millones**, el contribuyente sale de
  RESICO: la app avisa (`RESICO_ANNUAL_LIMIT`).

**Ejemplo.** Cobraste $30,000 + IVA a una empresa que te retuvo 1.25 % de ISR:
ingreso $30,000 → tasa 1.10 % → ISR $330 − retenido $375 → **ISR a cargo $0**.

## 4. IVA mensual

```
IVA trasladado cobrado (16 %, 8 % frontera)
− IVA retenido por personas morales (10.6667 % = dos terceras partes)
− IVA acreditable (IVA de gastos del negocio efectivamente pagados)
= IVA a cargo  ó  saldo a favor (si es negativo)
− saldo a favor de meses anteriores (solo si quedó a cargo)
= IVA a pagar
```

- Se declaran por separado las bases: gravadas al 16 %, al 8 %, al 0 %, exentas y
  no objeto.
- **Acreditar es opcional y viene apagado** (`Profile.creditIva`). La ley (art. 5
  fr. I LIVA) solo deja acreditar IVA de gastos *deducibles para ISR*, y en RESICO
  no hay deducciones; el SAT lo permite por regla miscelánea (3.13.20 en 2022)
  si el gasto *sería* deducible. Muchos contadores no acreditan porque: (1) con
  retención de 2/3 del IVA el IVA a cargo ya es bajo y acreditar deja saldo a
  favor casi cada mes, que solo se recupera con devolución (suele traer
  revisión); (2) la mayoría de los gastos de una persona no son de su actividad;
  (3) el prellenado no trae IVA acreditable.
- Al activarlo, la app revisa lo que se puede ver en el CFDI (`ineligibleReason`):
  uso del CFDI G01, G03 o I01–I08; régimen del receptor 626; y que no se haya
  pagado en efectivo si pasa de $2,000. Si queda saldo a favor, la app avisa.
- El IVA acreditable debe venir de gastos **estrictamente indispensables** para
  la actividad y pagados con medios electrónicos si pasan de $2,000. La app usa
  todas las facturas recibidas que cuenten; el usuario excluye las personales
  con el interruptor de la guía (que cambia `Bill.count`).
- Si hay actividades exentas y gravadas a la vez, el acreditamiento es
  proporcional; **fuera de alcance v1** (la app avisa con exentos > 0).
- El saldo a favor de meses anteriores lo captura el usuario (la app aún no lleva
  el remanente entre declaraciones).

**Ejemplo.** Mismo cobro de $30,000: trasladado $4,800 − retenido $3,200.01 −
acreditable de gastos $300 = **IVA a cargo $1,299.99**.

## 5. Flujo en el portal del SAT

Basado en el tutorial de un contador ([YouTube, «Declaración mensual RESICO
2026»](https://www.youtube.com/watch?v=XjCE6y2uBxg)) y confirmado con el HTML
del portal (octubre 2026). Selectores y llaves: `sat-portal-resico-map.md`.

Navegación en sat.gob.mx: **Declaraciones → Personas → Provisionales y
definitivas → ISR e IVA RESICO (+) → Ingresar al servicio**. La extensión va
directo al nuevo portal de pagos provisionales:
`https://pstcdypisr.clouda.sat.gob.mx/Declaracion/Temporales`. El portal viejo
(`ptscdecprov`) ya no ofrece las obligaciones de RESICO.

- Acceso: RFC + contraseña (con captcha) o **e.firma**. El portal manda a
  `loginda.siat.sat.gob.mx/nidp/…`; con la e.firma desbloqueada, `js/background.js`
  inyecta ahí el mismo login de facturas (`js/forms/fill-form-sign-in.js`: pasa
  a *e.firma*, carga `.cer`/`.key`/contraseña y envía). La extensión **nunca
  resuelve captchas**; sin e.firma el usuario entra y la app espera hasta 3 minutos. Si el
  portal falla, el SAT recomienda cambiar de navegador.

Pantallas, en orden:

1. **Formulario no concluido** (solo si hay borradores) → *Iniciar una nueva
   declaración*. Si el periodo ya tiene borrador, al dar *Siguiente* el portal
   pregunta si reemplazarlo: la app elige *Reemplazar* para partir del prellenado.
2. **Datos iniciales**: Ejercicio, Periodicidad `Mensual`, Periodo (mes), Tipo de
   declaración `Normal`.
3. **Obligaciones**: aparecen las que tenga el RFC. Se marcan *ISR simplificado
   de confianza* e *IVA*. Puede haber otras (retenciones de salarios o
   asimilados, retenciones de IVA) que la app **no** marca. *Siguiente* y esperar
   a que cargue el prellenado.
4. **Administración de la declaración**: lista de obligaciones; se entra a cada
   una con clic y se regresa con el botón *Administración de la declaración*.
5. **ISR**, pestaña *Ingresos*:
   - *¿Los ingresos fueron obtenidos a través de copropiedad?* → **No**
     (solo aplica a bienes en copropiedad).
   - *Descuentos, devoluciones y bonificaciones* → Agregar → *Sin ingresos a
     disminuir* → 0. El portal pide el renglón aunque sea en cero.
   - El ingreso **prellenado puede venir incompleto** (en el video: $136k
     prellenados contra $139k cobrados). La diferencia se suma en *Ingresos
     adicionales* → Agregar → *Ingresos no considerados en el prellenado*.
   - *Total de ingresos percibidos* → Capturar → Agregar → elegir **tipo de
     ingreso** (actividad empresarial, honorarios, agrícolas/ganaderas, uso o goce
     temporal de bienes) → importe → Guardar → Cerrar. El tipo se toma del perfil
     (`Profile.resicoActivity`).
6. **ISR**, pestaña *Determinación*: el SAT calcula la tasa y el *ISR
   determinado*. *ISR retenido* trae lo de facturas emitidas; si no cuadra, en
   *Ver detalle* se suma la diferencia y *No acreditable* va en 0. Resultado:
   *ISR a cargo*.
7. **ISR**, pestaña *Pago*: *¿Tienes compensaciones por aplicar?* → No;
   *¿Tienes estímulos?* → No. Guardar → Administración de la declaración.
8. **IVA**:
   - *Actividades gravadas a la tasa del 16%* viene prellenado; se escribe lo
     cobrado de verdad. El SAT calcula el *IVA trasladado*.
   - *IVA retenido* viene prellenado; se corrige directo.
   - *IVA acreditable* **no viene prellenado**: Capturar → importe → *IVA
     acreditable por actividades mixtas* → 0 (solo gastos 100 % del negocio) →
     Continuar.
   - Saldo a favor de meses anteriores: se aplica hasta el monto a cargo.
   - Pestaña *Pago*: estímulos → No. Guardar → Administración de la declaración.
9. **Enviar declaración** → confirmar (lo hace el usuario).
10. **Acuse**: número de operación, importe, **línea de captura** y vigencia;
    *Guardar* descarga el PDF.

## 6. Mapeo campo del portal ↔ cálculo

Las claves son las que usa `app/src/lib/sat-declaration.ts` (`PORTAL_FIELDS`).
Cada una se lee por la **llave del modelo del SAT** (`view-model` / `data-bind`,
p. ej. `E4570020PSAT1101006`), no por texto ni por id del DOM; la tabla de
llaves está en `sat-portal-resico-map.md`.

| Clave | Etiqueta en el portal | Valor de la app | Cómo se captura |
| --- | --- | --- | --- |
| `isr.ingresos` | Total de ingresos percibidos | `isr.income` | Diferencia en *Ingresos adicionales* + clasificación por tipo |
| `isr.tasa` | Tasa aplicable | `isr.rate` | Solo lectura |
| `isr.impuesto` | ISR determinado | `isr.tax` | Solo lectura |
| `isr.retenido` | ISR retenido | `isr.retained` | Diferencia en *Ver detalle* |
| `isr.aCargo` | ISR a cargo | `isr.due` | Solo lectura |
| `iva.gravados16` / `8` / `0` | Actividades gravadas a la tasa del 16 % / 8 % / 0 % | `iva.taxed16` / `8` / `0` | Directo |
| `iva.exentos` / `iva.noObjeto` | Actividades exentas / no objeto | `iva.exempt` / `notObject` | Directo si hay importe |
| `iva.trasladado` | IVA trasladado | `iva.translated` | Solo lectura |
| `iva.retenido` | IVA retenido | `iva.retained` | Directo |
| `iva.acreditable` | IVA acreditable | `iva.creditable` | *Capturar* + mixtas en 0 |
| `iva.saldoAnterior` | Acreditamiento de saldos a favor de periodos anteriores | `iva.previousBalance` | Directo |
| `iva.resultado` | Impuesto a cargo / Saldo a favor | `iva.result` | Solo lectura |

El plan de captura sale de `buildFillPlan(prefill, nuestros)`. Si el prellenado
trae **más** ingreso del cobrado, la app no lo resta sola: lo deja como paso
manual (suele ser una factura cancelada o una PPD sin cobrar).

## 7. Automatización (extensión)

1. El usuario revisa la guía en la app y presiona **Autorizar y llenar en el SAT**
   → se guarda `Declaration` (`id = "YYYY-MM"`, estado `autorizada`).
2. `fillDeclaration()` abre el portal, espera el login, inicia una declaración
   nueva, llena ejercicio, periodo y tipo, y confirma las obligaciones de RESICO
   (ya vienen marcadas; un clic las desmarcaría).
3. **Scrape**: lee lo prellenado de cada obligación (`satPrefill`) y la app
   muestra *SAT prellenó / Nosotros / Diferencia*.
4. **Captura** según la tabla anterior, disparando `input`, `change` y `blur`
   (como `js/forms/fill-form-bill.js`). Lo que no logra queda en `missingFields`
   (campos) y `manualSteps` (instrucciones para el usuario), sin abortar todo.
5. Contesta "No" en la pestaña *Pago*, guarda y regresa a *Administración de la
   declaración*. Muestra el aviso *Revisa y presiona Enviar tú mismo*. **La
   extensión nunca presiona Enviar.** Estado → `llenada`.
6. Cuando aparece el acuse, la app lee número de operación, importe, línea de
   captura y vigencia, los guarda (`presentada`) y descarga el PDF a
   `Descargas/contabilizate/declaraciones/`.

**No confiar en el prellenado** (la recomendación principal del tutorial):
descargar todas las facturas emitidas y recibidas del mes y declarar lo que se
cobró de verdad, aunque el prellenado traiga menos.

## 8. Fuera de alcance (v1)

- Declaraciones complementarias y en ceros sin facturas descargadas.
- Prorrateo de IVA acreditable con actividades exentas.
- Remanente automático de saldo a favor entre meses.
- Arrendamiento con retenciones distintas y copropiedad.
- Obligaciones extra: retenciones de salarios o asimilados y retenciones de IVA.
- Compensaciones y estímulos (siempre se contesta "No").
- Días inhábiles oficiales para la fecha límite.

## 9. Capturas de referencia

El HTML de cada pantalla vive en `app/src/lib/__fixtures__/sat-portal/`
(`temporales.html`, `perfil-declaracion.html`, `formulario-resico.html` con ISR
e IVA) y `sat-portal.test.ts` corre las acciones del agente contra él. Si el SAT
cambia el formulario, se vuelve a capturar: llenar un periodo sin enviar,
`document.documentElement.outerHTML` sin `<script>`/`<style>`, y quitar RFC,
nombre y tokens. Falta capturar el acuse.
