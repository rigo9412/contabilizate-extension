// Todos los registros llevan id, updatedAt y deletedAt para poder combinar
// respaldos y, más adelante, sincronizar entre dispositivos: gana el registro
// con el updatedAt más reciente y los borrados viajan como "tombstones".
export interface SyncRecord {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface Profile extends SyncRecord {
  name: string;
  rfc: string;
  postalCode: string;
  regimenFiscal: string;
  /** De dónde vienen los ingresos de RESICO; el portal pide clasificar el total así. */
  resicoActivity?: ResicoActivity;
  /** Acreditar el IVA de gastos en la declaración mensual (apagado por defecto). */
  creditIva?: boolean;
  /** Ingresos recurrentes (sueldo, renta…) que sirven de referencia para el plan de ahorro. */
  fixedIncomes?: FixedIncome[];
}

export type IncomeFrequency = "semanal" | "quincenal" | "mensual" | "bimestral" | "anual";

export interface FixedIncome {
  id: string;
  name: string;
  /** Monto que realmente te llega cada vez (ya neto de impuestos). */
  amount: number;
  frequency: IncomeFrequency;
}

export type ResicoActivity = "empresarial" | "honorarios" | "arrendamiento" | "agricola";

export interface EncryptedPayload {
  salt: string;
  iv: string;
  data: string;
}

/** e.firma cifrada con una llave derivada de la contraseña de la propia e.firma. */
export interface Vault extends SyncRecord {
  cerFileName: string;
  keyFileName: string;
  payload: EncryptedPayload;
}

export interface VaultSecrets {
  /** Data URLs, el mismo formato que usan los scripts de llenado. */
  cer: string;
  key: string;
  password: string;
}

export interface BillTax {
  type: string;
  section: string;
  base?: number;
  total: number;
  factor?: string;
  porcentageOrValue?: string;
}

export interface BillItem {
  /** Clave de producto o servicio del SAT (p. ej. 81111600). */
  serviceId: string;
  /** Nombre del producto tal como aparece en el buscador del portal del SAT. */
  serviceName?: string;
  description: string;
  quantity: number;
  /** Nombre de la unidad (texto libre del CFDI). */
  unitId: string;
  /** Clave de unidad del SAT (p. ej. E48). */
  unit: string;
  noIdentification: string;
  objectImp: string;
  unitValue: number;
  subtotal: number;
  taxes: BillTax[];
}

/**
 * InformacionGlobal del CFDI (factura global a público en general). Mes o año
 * vacíos = se toman del periodo de la fecha de emisión al emitir.
 */
export interface GlobalInfo {
  periodicidad: string;
  meses: string;
  anio: string;
}

/**
 * Un documento pagado dentro de un complemento de pago (CFDI tipo P): lo que
 * se cobró de una factura PPD y cuándo. Con esto se calcula el flujo de
 * efectivo de RESICO.
 */
export interface BillPayment {
  /** Fecha del pago (FechaPago), YYYY-MM-DDTHH:mm:ss. */
  date: string;
  /** UUID de la factura PPD que se pagó (IdDocumento), en mayúsculas. */
  relatedUuid: string;
  /** Importe pagado en pesos, con IVA y menos retenciones. */
  amountPaid: number;
  partiality?: number;
  /** Impuestos proporcionales al pago (ImpuestosDR) en pesos; vacío en complementos 1.0. */
  taxes: BillTax[];
}

export interface Bill extends SyncRecord {
  folio?: string;
  description?: string;
  date: string;
  typeBill: string;
  typePayment?: string;
  paymentMethod?: string;
  currency?: string;
  version?: string;
  noCertificate?: string;
  rfcEmisor: string;
  nameEmisor?: string;
  rfcReceptor: string;
  nameReceptor?: string;
  postalCodeEmisor?: string;
  postalCodeReceptor?: string;
  useCFDIReceptor?: string;
  typeReceptorRegistration?: string;
  subtotal: number;
  totalTaxesTranslated: number;
  totalTaxesRetention: number;
  total: number;
  count: boolean;
  /** Cancelada en el SAT (según la consulta del portal); no cuenta en el resumen. */
  cancelled?: boolean;
  items: BillItem[];
  globalInfo?: GlobalInfo;
  /** Tipo de cambio del comprobante cuando no es MXN. */
  exchangeRate?: number;
  /** Solo en complementos de pago (tipo P). */
  payments?: BillPayment[];
}

export type BillDraft = Omit<Bill, keyof SyncRecord>;

/** Fechas que cambian solas en la descripción según la fecha de emisión. */
export interface AutoDates {
  enabled: boolean;
  period: "quincena" | "mes";
  which: "actual" | "anterior";
}

export interface Template extends SyncRecord {
  alias: string;
  bill: BillDraft;
  autoDates?: AutoDates;
}

export interface SatDownload extends SyncRecord {
  typeBill: "issued" | "received";
  startDate: string;
  endDate: string;
  status: string;
  numberCFDI: number;
}

export interface CardMovement {
  /** Fecha de la operación (YYYY-MM-DD). */
  date: string;
  /** Fecha en que el banco aplicó el cargo (YYYY-MM-DD). */
  chargeDate: string;
  description: string;
  /** Categoría que asigna el banco (Nu la imprime junto a cada compra). */
  bankCategory?: string;
  /** Positivo = cargo (compra), negativo = abono (pago, devolución). */
  amount: number;
  /** RFC del comercio, cuando el banco lo imprime (Nu). */
  merchantRfc?: string;
  /** Últimos 4 dígitos de la tarjeta digital con que se hizo la compra. */
  digitalCard?: string;
  /** Compra en otra moneda: monto original y tipo de cambio que aplicó el banco. */
  foreignCurrency?: string;
  foreignAmount?: number;
  exchangeRate?: number;
}

/** Estado de cuenta de tarjeta de crédito; el id es banco + tarjeta + fecha de corte. */
export interface CardStatement extends SyncRecord {
  bank: string;
  cardName: string;
  cardLast4: string;
  periodStart: string;
  /** Fecha de corte. */
  periodEnd: string;
  dueDate?: string;
  previousBalance?: number;
  totalCharges: number;
  totalPayments: number;
  paymentNoInterest?: number;
  minimumPayment?: number;
  creditLimit?: number;
  movements: CardMovement[];
}

export type DeclarationStatus = "borrador" | "autorizada" | "llenada" | "presentada";

/** Renglones de ISR RESICO tal como se capturan en el portal de Declaraciones. */
export interface IsrResico {
  /** Ingresos cobrados del mes, sin IVA. */
  income: number;
  rate: number;
  tax: number;
  retained: number;
  due: number;
}

export interface IvaResico {
  /** Base cobrada por tasa. */
  taxed16: number;
  taxed8: number;
  taxed0: number;
  exempt: number;
  notObject: number;
  translated: number;
  /** IVA de gastos efectivamente pagados. */
  creditable: number;
  retained: number;
  /** Saldo a favor de meses anteriores que se aplicó. */
  previousBalance: number;
  /** Positivo = a cargo; negativo = saldo a favor. */
  result: number;
}

/** Valor leído del portal del SAT o capturado por la extensión, por clave de campo. */
export type PortalValues = Record<string, number | null>;

/** Declaración mensual de RESICO; el id es "YYYY-MM". */
export interface Declaration extends SyncRecord {
  year: number;
  month: number;
  status: DeclarationStatus;
  isr: IsrResico;
  iva: IvaResico;
  /** Lo que el SAT traía prellenado al abrir la declaración. */
  satPrefill?: PortalValues;
  /** Campos que la extensión no encontró y quedaron para captura manual. */
  missingFields?: string[];
  /** Pasos del portal que la extensión no pudo completar, en palabras para el usuario. */
  manualSteps?: string[];
  operationNumber?: string;
  captureLine?: string;
  amountDue?: number;
  captureLineDueDate?: string;
}

/** Plan de ahorro guardado; hay uno solo (id "main") y se compara cada mes contra lo real. */
export interface SavingsPlan extends SyncRecord {
  name: string;
  target: number;
  /** Lo ahorrado al arrancar el plan. */
  initialSaved: number;
  /** Primer mes del plan, "YYYY-MM". */
  startMonth: string;
  deadlineMonths: number;
  /** Cuota mensual comprometida (fija al guardar). */
  monthlyGoal: number;
  /** Supuestos con los que se armó, solo informativos. */
  income: number;
  spent: number;
}
