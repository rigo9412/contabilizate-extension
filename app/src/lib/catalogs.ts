// Catálogos del SAT copiados de la web de contabilizate (src/features/bill/types.ts).

export const keyProductService: Record<string, string> = {
  "81111600" : "Programadores de computador",
}

export const typeCFDI: Record<string, string> = {
  "I": "Ingreso",
  "E": "Egreso",
  "P": "Pago",
  "N": "Nomina",
  "T": "Traslado",
  "NA": "No Aplica",
}

export const cfdiUsages: Record<string, string> = {
  "G01": "Adquisición de mercancías",
  "G02": "Devoluciones, descuentos o bonificaciones",
  "G03": "Gastos en general",
  "I01": "Construcciones",
  "I02": "Mobiliario y equipo de oficina por inversiones",
  "I03": "Equipo de transporte",
  "I04": "Equipo de computo y accesorios",
  "I05": "Dados, troqueles, moldes, matrices y herramental",
  "I06": "Comunicaciones telefónicas",
  "I07": "Comunicaciones satelitales",
  "I08": "Otra maquinaria y equipo",
  "D01": "Honorarios médicos, dentales y gastos hospitalarios",
  "D02": "Gastos médicos por incapacidad o discapacidad",
  "D03": "Gastos funerales",
  "D04": "Donativos",
  "D05": "Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)",
  "D06": "Aportaciones voluntarias al SAR",
  "D07": "Primas por seguros de gastos médicos",
  "D08": "Gastos de transportación escolar obligatoria",
  "D09": "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
  "D10": "Pagos por servicios educativos (colegiaturas)",
  "S01": "Sin efectos fiscales",
  "CP01": "Pagos",
  "CN01": "Nómina",
  "P01": "Por definir"
}

export const paymentMethods: Record<string, string> = {
  "PUE": "Pago en una sola exhibición",
  "PPD": "Pago en parcialidades o diferido"
}

export const paymentForms: Record<string, string> = {
  "01": "Efectivo",
  "02": "Cheque nominativo",
  "03": "Transferencia electrónica de fondos",
  "04": "Tarjeta de crédito",
  "05": "Monedero electrónico",
  "06": "Dinero electrónico",
  "08": "Vales de despensa",
  "12": "Dación en pago",
  "13": "Pago por subrogación",
  "14": "Pago por consignación",
  "15": "Condonación",
  "17": "Compensación",
  "23": "Novación",
  "24": "Confusión",
  "25": "Remisión de deuda",
  "26": "Prescripción o caducidad",
  "27": "A satisfacción del acreedor",
  "28": "Tarjeta de débito",
  "29": "Tarjeta de servicios",
  "30": "Aplicación de anticipos",
  "31": "Intermediario pagos",
  "99": "Por definir"
}

export const currency: Record<string, string> = {
  "MXN": "Peso Mexicano",
  "USD": "Dólar Americano",
  "EUR": "Euro",
  "ARS": "Peso Argentino",
  "CLP": "Peso Chileno",
  "COP": "Peso Colombiano",
  "CRC": "Peso Costarricense",
  "CUP": "Peso Cubano",
  "DOP": "Peso Dominicano",
  "GTQ": "Quetzal Guatemalteco",
  "HNL": "Lempira Hondureño",
  "MXV": "Unidad de Inversion (UDI)",
  "NIO": "Córdoba Oro",
  "PAB": "Balboa Panameño",
  "PEN": "Nuevo Sol Peruano",
  "PYG": "Guaraní Paraguayo",
  "UYU": "Peso Uruguayo",
  "VEF": "Bolívar Venezuelano",
}

export const typeTaxes: Record<string, string> = {
  "001": "ISR",
  "002": "IVA",
  "003": "IEPS",
}

export const typeObjectImp: Record<string, string> = {
  "01": "No objeto de impuesto",
  "02": "Sí objeto de impuesto",
  "03": "Sí objeto del impuesto y no obligado al desglose",
  "04": "Sí objeto del impuesto y no causa impuesto",
  "05": "Sí objeto del impuesto, IVA crédito PODEBI",
  "06": "Sí objeto del IVA, No traslado IVA",
  "07": "No traslado del IVA, Sí desglose IEPS",
  "08": "No traslado del IVA, No desglose IEPS"
};

export const unitMeasure: Record<string, string> = {
  "H87": "Pieza",
  "E48": "Unidad de servicio",
  "KGM": "Kilogramo",
  "LTR": "Litro",
  "MTR": "Metro",
  "GRM": "Gramo",
  "MLT": "Mililitro",
  "XBX": "Caja",
  "XUN": "Unidad (genérico)",
  "CMT": "Centímetro"
};

export const taxRegimes: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "607": "Régimen de Enajenación o Adquisición de Bienes",
  "608": "Demás ingresos",
  "610": "Residentes en el Extranjero sin Establecimiento Permanente en México",
  "611": "Ingresos por Dividendos (socios y accionistas)",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "614": "Ingresos por intereses",
  "615": "Régimen de los ingresos por obtención de premios",
  "616": "Sin obligaciones fiscales",
  "620": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  "621": "Incorporación Fiscal",
  "622": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  "623": "Opcional para Grupos de Sociedades",
  "624": "Coordinados",
  "625": "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza"
};

export const TAXES_ISR = "001";
export const TAXES_IVA = "002";
export const TYPE_TAXES_RETENTION = "retencion";
export const TYPE_TAXES_TRASLATE = "traslado";
