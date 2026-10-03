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
}

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
  items: BillItem[];
  globalInfo?: GlobalInfo;
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
