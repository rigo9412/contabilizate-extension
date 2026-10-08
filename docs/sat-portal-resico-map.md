# Mapa del portal de pagos provisionales (RESICO PF)

Selectores reales del portal del SAT para automatizar el llenado de la
declaración mensual de RESICO. Se obtuvieron simulando octubre 2026 sin enviar
(formulario versión 24.0.0). Para las reglas de cálculo, ver
`declaracion-resico.md`.

> El portal de RESICO es **`https://pstcdypisr.clouda.sat.gob.mx/`** (nuevo
> portal de pagos provisionales). `ptscdecprov.clouda.sat.gob.mx` es el portal
> viejo (ASP.NET) y ya no ofrece las obligaciones de RESICO.
> Las llaves de este documento son las de `PORTAL_FIELDS` y `PORTAL_KEYS` en
> `app/src/lib/sat-declaration.ts` (con `{e}` en lugar de la entidad).

## 1. Configuración — `/Declaracion/PerfilDeclaracion`

Se llega con `/Declaracion/Temporales` (redirige). jQuery, sin iframes. Los
selects se cargan **en cascada**: después de cada `change` hay que esperar a que
el siguiente tenga opciones (hacen `POST /Declaracion/ConfiguracionInicial` y
`/Declaracion/ValidacionConceptos`).

| Campo | Selector | Valores |
| --- | --- | --- |
| Ejercicio | `#ejercicio` | `"2026"` |
| Periodicidad | `#periodicidad` | `"M"` = Mensual |
| Periodo | `#periodos` | `"001"`…`"012"` (3 dígitos) |
| Tipo de declaración | `#tipodeclaracion` | `"001"` Normal, `"002"` Complementaria |
| Tipo complementaria | `#tipocomplementaria` | solo con `002` |
| Siguiente | `#btnSiguiente` | |

### Obligaciones

`#sectionObligaciones input[name="btnObligacion"]`: checkbox oculto (`d-none`).
El `id` es la clave de la obligación.

| Clave | Obligación |
| --- | --- |
| `0168` | ISR simplificado de confianza. Personas físicas |
| `0318` | IVA simplificado de confianza región fronteriza |
| `0112`, `0113`, `0301`, `0304`, `0449` | Retenciones, IVA fronterizo general, IEPS: no se usan |

- Las obligaciones registradas en el RFC **ya vienen marcadas**. Para marcar o
  desmarcar se hace clic en `label[for="<clave>"]`. El estado se ve en
  `label[for] span.checkOn` / `.checkOff` o en `input.checked`. **Antes de hacer
  clic, revisa `checked`.** Si desmarcas una registrada, sale un `bootbox` de
  aviso ("Obligación registrada en RFC no seleccionada…"), que se cierra con
  `.bootbox .bootbox-accept`.
- En RESICO de otra región, el IVA tendrá otra clave (sin "región fronteriza").
  Hay que buscarla por texto `simplificado de confianza` en
  `input[name=btnObligacion]` → `parentElement.innerText`.
- `data-valida-idc="true"` aparece en las de RESICO.

## 2. Formulario — `/Formulario/Formulario?data=…`

Motor "fb" del SAT sobre **Knockout 2.3** (`window.ko`). Al cargar:

1. `.modal.show` con "Cargando información" → esperar a que desaparezca.
2. `#modalPrellenado` (fechas de corte del prellenado) → cerrar con su botón `CERRAR`.

### Administración de la declaración

| Elemento | Selector |
| --- | --- |
| Abrir ISR | `a.opcion-menu[data-titulo-grupo="457group1"]` |
| Abrir IVA | `a.opcion-menu[data-titulo-grupo="454group1"]` |
| Vista previa | `#btnVistaPrevia` |
| **Enviar (NO tocar)** | `#btnEnviaDec` |

Dentro de una obligación: `GUARDAR` = `button.guardardeclaracion`; volver =
`#ir-menu-principal`.

### Cómo leer y escribir

Cada campo tiene una **llave semántica** en `view-model="E…"` (o en
`data-bind="value: E…"`). El `id` DOM (`457modal8`) depende del orden del
formulario. Conviene usar la llave:

```js
const el = document.querySelector('[view-model="E4570001PSAT1100101"]');
// leer: el.value ("8,333") o el modelo:
ko.dataFor(el).E4570001PSAT1100101();       // 8333 (número)
```

Para escribir en un input editable: asigna `value`, luego dispara `change` y
`blur`, porque el binding es `valueUpdate: "blur"`. En los selects basta con
asignar `value` y disparar `change`.

Los campos con botón **Capturar / Ver detalle / DETALLE** abren
`#modal-<id del input>` (p. ej. `#modal-457modal70`). Ese input es de solo
lectura: se llena dentro del modal.

## 3. ISR RESICO (entidad 457)

Pestañas: `#242,INSPF01-tab` Ingresos · `#4572-tab` Determinación ·
`#4573-tab` Pago · `#4714-tab` Datos adicionales. Hay que seleccionar con
`document.getElementById(...)` porque el id lleva coma.

### Ingresos (`#tab457maincontainer1`)

| Llave | id | Campo | Edita |
| --- | --- | --- | --- |
| `E4570001PSAT1100105` | `457select7` | *¿Ingresos por copropiedad? (`1` Sí, `2` No) | select |
| `E4570001PSAT1100101` | `457modal8` | Total de ingresos efectivamente cobrados (prellenado) | modal DETALLE |
| `E4570001PSAT1100106` | `457modal9` | Descuentos, devoluciones y bonificaciones | modal CAPTURAR |
| `E4570001PSAT1100107` | `457select48` | *¿Tienes ingresos a disminuir? | select |
| `E4570001PSAT1100102` | `457modal49` | Ingresos a disminuir | modal |
| `E4570001PSAT1100108` | `457select59` | *¿Tienes ingresos adicionales? | select |
| `E4570001PSAT1100103` | `457modal60` | Ingresos adicionales | modal |
| `E4570001PSAT1100104` | `457modal70` | Total de ingresos percibidos por la actividad | modal CAPTURAR |

**Modal `#modal-457modal70`** (desglose por actividad, obligatorio):
`E4570001PSAT1100501` monto por detallar, `E4570001PSAT1100502` monto
detallado, botón `Agregar` → `#457select77` concepto (`E4570012PSAT1100503`) +
`#457textbox78` importe (`E4570012PSAT1100504`) → `Guardar` (de la fila) →
`Guardar` (del modal).
Conceptos: `I1` Actividad empresarial · `I2` Servicios profesionales ·
`I4` Agrícolas… · `I5` Enajenación de activos · `I6` Uso o goce temporal de bienes.

**Modal `#modal-457modal49`** (a disminuir): `#457select56`
(`E4570009PSAT1100301`) — `ID2` IEPS no trasladado · `ID3` pendientes de
cancelación · `ID4` acumulados en periodos anteriores · `ID6` apoyos
gubernamentales · `ID8` a cuenta de terceros; importe `#457textbox57`.

**Modal `#modal-457modal60`** (adicionales): `#457select67`
(`E4570010PSAT1100401`) — `IA4` Ingresos no considerados en el prellenado;
importe `#457textbox68`.

**Modal `#modal-457modal9`** (descuentos): campos `E4570008PSAT11006xx`
(facturas de egreso) y totales `E4570001PSAT1100607`–`609`.

**Modal `#modal-457modal8`** (detalle de ingresos cobrados, solo lectura):
PUE `E4570003PSAT11002xx`, PPD/complementos `E4570006PSUMFAC00x`, totales
`E4570001PINGCM001/002`, `E4570001PSAT1100208`.

### Determinación (`#tab457maincontainer2`)

| Llave | id | Campo |
| --- | --- | --- |
| `E4570020PSAT1101001` | `457modal93` | Total de ingresos percibidos |
| `E4570020PSAT1101003` | `457modal119` | Base gravable |
| `E4570020PSAT1101004` | `457textbox175` | Tasa aplicable (`"1.00%"`) |
| `E4570020PSAT1101005` | `457textbox177` | Impuesto mensual |
| `E4570020PPFPECA01` | `457modal179` | Pagos efectuados con anterioridad |
| `E4570020PSAT1101006` | `457modal190` | ISR retenido por personas morales |
| `E4570020PSAT1101007` | `457textbox217` | Impuesto a cargo |
| `E4570020PPFPECA09` | `457textbox218` | Impuesto a favor |

**Modal `#modal-457modal190`** (ISR retenido): PUE `E4570005PSAT11012xx`,
complementos `E4570007PSUMAISR00x`, totales `E4570020PSUMAISR006/007`,
`E4570020PSAT1101216`, `E4570020PSAT1101209`.

### Pago (`#tab457maincontainer10001`)

| Llave | id | Campo |
| --- | --- | --- |
| `E4570017P4570301001` | `457select100014` | *¿Compensaciones? → `2` No |
| `E4570017P4570301002` | `457select100017` | *¿Estímulos? → `2` No |
| `E4570017P457C23A` | `457select100054` | ¿Parcialidades? (`0` No) |
| `E4570017P457C26` | `457textbox100060` | Cantidad a pagar |

### Datos adicionales (`#tab457maincontainer10002`)

Solo aplica con copropiedad: `E4570021PARRCOP02` y siguientes.

## 4. IVA RESICO región fronteriza (entidad 454)

Pestañas: `#285,INVS01V2-tab` Determinación · `#4543-tab` Pago.

### Determinación (`#tab454maincontainer1`)

| Llave | id | Campo | Edita |
| --- | --- | --- | --- |
| `E4540001PSAT1200101` | `454modal5` | Actividades gravadas 16% | sí |
| `E4540001PSAT1200102` | `454modal6` | Actividades sujetas al estímulo de la región fronteriza (8%) | sí |
| `E4540001PSAT1200103` | `454modal7` | Actividades gravadas 0% | sí |
| `E4540001PISCPOLOS0001` | `454modal8` | *Valor actos emitidos con estímulo fiscal | sí |
| `E4540001P1200120` | `454modal9` | *Valor actos emitidos a los que aplican estímulos | sí |
| `E4540001PSAT1200104` | `454modal11` | Actividades exentas | sí |
| `E4540001PSAT1200105` | `454modal12` | Actividades no objeto | sí |
| `E4540001PSAT1200106` | `454modal13` | IVA a cargo 16% | no |
| `E4540001PSAT1200107` | `454modal14` | IVA a cargo con estímulo fronterizo | no |
| `E4540001PSAT1200108` | `454textbox15` | Total de IVA a cargo | no |
| `E4540001PSAT1200109` | `454modal16` | IVA no cobrado por devoluciones… | sí |
| `E4540001PSAT1200110` | `454modal17` | IVA retenido | sí |
| `E4540001PSAT1200111` | `454modal18` | *IVA acreditable del periodo | modal Capturar |
| `E4540001PISCPOLOS0002` | `454modal19` | *Valor actos recibidos con estímulo | sí |
| `E4540001P1200121` | `454modal20` | *Valor actos recibidos a los que aplican estímulos | sí |
| `E4540001PSAT1200112` | `454modal22` | IVA por devoluciones en gastos | sí |
| `E4540001PSAT1200113` | `454textbox23` | Cantidad a cargo | no |
| `E4540001PSAT1200114` | `454textbox24` | Acreditamiento de saldo a favor anterior | sí |
| `E4540001PSAT1200115` | `454textbox402` | Impuesto a cargo | no |
| `E4540001PSAT1200116` | `454textbox403` | Impuesto a favor | no |
| `E4540001P1200119` | `454textbox405` | Impuesto a favor (final) | no |

**Modal `#modal-454modal18`** (IVA acreditable): `E4540006PSAT1200601`
(`#454modal298`, IVA pagado en gastos, con su propio DETALLE),
`E4540006PSAT1200602` acreditable por actividades gravadas,
`E4540006PSAT1200603` por actividades mixtas (→ 0),
`E4540006PSAT1200604` acreditable del periodo, `E4540006PSAT1200605` no acreditable.

**Modal `#modal-454modal17`** (IVA retenido, detalle): `E4540005PSAT12005xx`,
`E4540022PSAT12005xx`, totales `E4540001PSAT1200508/509/515`.

**Modal `#modal-454modal6`** (detalle fronterizo): `E4540011PDASERF*`,
`E4540012PDASERFP*`, totales `E4540001PDASERFBFETI/BFEP/ASERF`.

### Pago (`#tab454maincontainer10001`)

| Llave | id | Campo |
| --- | --- | --- |
| `E4540002P4540301001` | `454select100014` | *¿Compensaciones? → `2` No |
| `E4540002P4540301002` | `454select100017` | *¿Estímulos? → `2` No |
| `E4540002P454C26` | `454textbox100060` | Cantidad a pagar |

## 5. Mapeo con `PORTAL_FIELDS` de la app

| Clave app | Llave portal |
| --- | --- |
| `isr.ingresos` | `E4570001PSAT1100104` (captura) / `E4570020PSAT1101001` (lectura) |
| `isr.tasa` | `E4570020PSAT1101004` |
| `isr.impuesto` | `E4570020PSAT1101005` |
| `isr.retenido` | `E4570020PSAT1101006` |
| `isr.aCargo` | `E4570020PSAT1101007` |
| `iva.gravados16` | `E4540001PSAT1200101` |
| `iva.gravados8` | `E4540001PSAT1200102` |
| `iva.gravados0` | `E4540001PSAT1200103` |
| `iva.exentos` | `E4540001PSAT1200104` |
| `iva.noObjeto` | `E4540001PSAT1200105` |
| `iva.trasladado` | `E4540001PSAT1200108` |
| `iva.retenido` | `E4540001PSAT1200110` |
| `iva.acreditable` | `E4540001PSAT1200111` (modal → `E4540006PSAT1200602`) |
| `iva.saldoAnterior` | `E4540001PSAT1200114` |
| `iva.resultado` | `E4540001PSAT1200115` (a cargo) / `E4540001PSAT1200116` (a favor) |

## 6. Comportamiento confirmado en vivo (simulación oct 2026, sin enviar)

- **Borrador existente:** al dar *Siguiente* aparece un bootbox copiado de
  `#modalYesNo` (la plantilla nunca se abre) con "Existe sin enviar…";
  *Reemplazar* = `.bootbox-accept`. Debajo queda abierto un bootbox "Cargando".
- **Prellenado:** el formulario tarda ~15–20 s; luego `#modalPrellenado` → CERRAR.
- **Ventanas con tabla** (ingresos adicionales, total percibido): cada renglón se
  guarda con `.btnAddItem`; el `.btnGuardarModal` está oculto (`display: none`)
  en todas las ventanas, así que se cierran con `.cerrar-modal`. Los valores se
  guardan al salir de cada campo.
- **Obligatorios aunque vayan en 0:** "Descuentos… de integrantes por
  copropiedad" (`E{e}0001PSAT1100608`, dentro de Descuentos) y los dos renglones
  del ISR retenido: "a adicionar (+)" y "no acreditable (-)".
- **Pestañas:** se desbloquean en orden (Pago queda `disabled` hasta pasar por
  Determinación). La obligación solo queda completa (`span.checkOn` en el menú)
  si se recorren todas y luego se guarda.
- **Guardar** es `<a class="guardardeclaracion">`; muestra "Guardando
  información" y se cierra solo.
- Con ISR e IVA completos, el menú muestra el monto de cada uno
  (`.monto-pagar-grupo`), "Total a pagar" se llena y `#btnEnviaDec` se habilita.
