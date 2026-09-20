/**
 * Spike de validación de arquitectura.
 *
 * Verifica, contra el portal real del SAT y dentro del WKWebView, los tres
 * supuestos de los que depende todo el port:
 *
 *   1. Que se pueda inyectar JS y recuperar su valor de retorno (el puente).
 *   2. Que el UA de escritorio haga que el SAT sirva el layout desktop y que
 *      los ids que la extensión ya mapea existan.
 *   3. Que `input.files = dataTransfer.files` funcione en WebKit, que es de
 *      lo que depende el login con e.firma. Si falla, se prueba el plan B:
 *      redefinir la propiedad `files` sobre el elemento.
 *
 * Si los tres pasan, el resto del port es trabajo mecánico.
 */
import { bridge } from './sat-bridge.js';
import { readCredential } from './secure-store.js';

const URL_LOGIN_FIEL = 'https://cfdiau.sat.gob.mx/nidp/app/login?id=SATx509Custom';

/**
 * Diagnóstico de la página, incluyendo iframes.
 *
 * El login del SAT corre sobre NetIQ Access Manager, que renderiza el
 * formulario dentro de un iframe. Sondear sólo el documento principal
 * devuelve un DOM vacío aunque la página se vea perfectamente.
 */
function probePage() {
  const ids = [
    'fileCertificate',
    'filePrivateKey',
    'txtCertificate',
    'txtPrivateKey',
    'privateKeyPassword',
    'submit',
  ];

  function resumen(doc, etiqueta) {
    try {
      const texto = doc.body ? doc.body.innerText || '' : '';
      return {
        contexto: etiqueta,
        accesible: true,
        url: doc.location ? doc.location.href : '(sin location)',
        title: doc.title || '',
        readyState: doc.readyState,
        largoTexto: texto.trim().length,
        textoInicio: texto.trim().slice(0, 150).replace(/\s+/g, ' '),
        inputs: Array.from(doc.querySelectorAll('input'))
          .map((el) => el.id || `(sin id, type=${el.type})`)
          .slice(0, 20),
        idsPresentes: ids.filter((id) => doc.getElementById(id) !== null),
        tieneBotonFiel: doc.getElementById('buttonFiel') !== null,
        tienePassword: texto.includes('Acceso por contraseña'),
        tieneFirma: texto.includes('Acceso con e.firma'),
      };
    } catch (e) {
      // Un iframe de otro origen lanza aquí: es información, no un fallo.
      return { contexto: etiqueta, accesible: false, error: String(e.message || e) };
    }
  }

  const docs = [resumen(document, 'principal')];
  const marcos = Array.from(document.querySelectorAll('iframe, frame'));

  marcos.forEach((f, i) => {
    const src = (f.getAttribute('src') || '(sin src)').slice(0, 70);
    const etiqueta = `frame[${i}] ${f.id ? '#' + f.id + ' ' : ''}${src}`;
    let doc = null;
    try {
      doc = f.contentDocument;
    } catch (e) {
      docs.push({ contexto: etiqueta, accesible: false, error: 'cross-origin' });
      return;
    }
    docs.push(doc ? resumen(doc, etiqueta) : { contexto: etiqueta, accesible: false, error: 'sin documento' });
  });

  const conFormulario = docs.find((d) => d.accesible && d.idsPresentes && d.idsPresentes.length);
  const conBoton = docs.find((d) => d.accesible && d.tieneBotonFiel);

  return {
    urlTop: location.href,
    innerWidth: window.innerWidth,
    totalFrames: marcos.length,
    docs,
    idsPresentes: conFormulario ? conFormulario.idsPresentes : [],
    idsFaltantes: ids.filter((id) => !(conFormulario ? conFormulario.idsPresentes : []).includes(id)),
    contextoFormulario: conFormulario ? conFormulario.contexto : null,
    tieneBotonFiel: !!conBoton,
    contextoBoton: conBoton ? conBoton.contexto : null,
  };
}

/**
 * Espera a que la página llegue al estado buscado, sondeando DESDE la app.
 *
 * No se puede hacer polling dentro de la página: el login del SAT redirige
 * (…&option=credential…) y la navegación destruye el script inyectado, que
 * entonces nunca responde. Reinyectar en cada intento hace que un redirect
 * cueste sólo un reintento.
 */
async function esperarFormulario(log, limite = 60000) {
  const inicio = Date.now();
  let pagina = null;
  let avisado = 0;

  while (Date.now() - inicio < limite) {
    try {
      pagina = await bridge.run(probePage, [], 8000);
      if (pagina.idsPresentes.length > 0) {
        return { listo: true, pagina, esperado: Date.now() - inicio };
      }
      // La pestaña de e.firma puede requerir un clic previo.
      if (pagina.tieneBotonFiel) {
        return { listo: false, necesitaClic: true, pagina, esperado: Date.now() - inicio };
      }
    } catch (e) {
      // Contexto destruido por una navegación en curso: se reintenta.
    }

    const transcurrido = Date.now() - inicio;
    if (transcurrido - avisado >= 5000) {
      avisado = transcurrido;
      log(`  … esperando el formulario (${Math.round(transcurrido / 1000)}s)`);
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  return { listo: false, pagina, esperado: Date.now() - inicio };
}

/**
 * Cambia a la pestaña de e.firma, buscando el botón en cualquier frame.
 * Los campos del certificado no existen hasta hacer este clic.
 */
function abrirPestanaFirma() {
  const docs = [document];
  document.querySelectorAll('iframe, frame').forEach((f) => {
    try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {}
  });

  for (const d of docs) {
    const btn = d.getElementById('buttonFiel');
    if (btn) {
      btn.click();
      return { clicado: true, donde: d === document ? 'principal' : 'iframe' };
    }
  }
  return { clicado: false, motivo: 'no se encontró buttonFiel en ningún frame' };
}

/** 3: la prueba decisiva. Se hace sobre un input sintético, sin tocar la página. */
function probeFileInjection() {
  const resultado = { dataTransferDisponible: false, setterFunciona: false, fallbackFunciona: false, error: null };

  try {
    resultado.dataTransferDisponible = typeof DataTransfer !== 'undefined';
    if (!resultado.dataTransferDisponible) return resultado;

    const input = document.createElement('input');
    input.type = 'file';
    const archivo = new File([new Uint8Array([1, 2, 3])], 'prueba.cer', {
      type: 'application/x-x509-ca-cert',
    });

    // Vía principal: la misma que usa hoy la extensión en Chrome.
    try {
      const dt = new DataTransfer();
      dt.items.add(archivo);
      input.files = dt.files;
      resultado.setterFunciona = input.files.length === 1 && input.files[0].name === 'prueba.cer';
    } catch (e) {
      resultado.error = String(e.message || e);
    }

    // Plan B: la página del SAT lee input.files[0] desde su propio JS, así que
    // basta con que la propiedad devuelva un FileList sintético.
    if (!resultado.setterFunciona) {
      const input2 = document.createElement('input');
      input2.type = 'file';
      const lista = Object.create(FileList.prototype);
      Object.defineProperties(lista, {
        0: { value: archivo, enumerable: true },
        length: { value: 1 },
        item: { value: (i) => (i === 0 ? archivo : null) },
      });
      Object.defineProperty(input2, 'files', { value: lista, configurable: true });
      resultado.fallbackFunciona = input2.files.length === 1 && input2.files[0].name === 'prueba.cer';
    }
  } catch (e) {
    resultado.error = String(e.message || e);
  }

  return resultado;
}

/** Inyecta las credenciales reales en el formulario y envía. */
function fillFirma(cert, key, password) {
  function base64ToFile(base64, filename, mimeType) {
    const bytes = atob(base64.split(',')[1]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], filename, { type: mimeType });
  }

  function docs() {
    const lista = [document];
    document.querySelectorAll('iframe, frame').forEach((f) => {
      try { if (f.contentDocument) lista.push(f.contentDocument); } catch (e) {}
    });
    return lista;
  }

  function buscar(id) {
    for (const d of docs()) {
      const el = d.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function setFile(inputId, file) {
    const input = buscar(inputId);
    if (!input) throw new Error(`No existe el input ${inputId}`);
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    } catch (e) {
      const lista = Object.create(FileList.prototype);
      Object.defineProperties(lista, {
        0: { value: file, enumerable: true },
        length: { value: 1 },
        item: { value: (i) => (i === 0 ? file : null) },
      });
      Object.defineProperty(input, 'files', { value: lista, configurable: true });
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files.length === 1;
  }

  const okCert = setFile('fileCertificate', base64ToFile(cert.content, 'certificado.cer', cert.type));
  const okKey = setFile('filePrivateKey', base64ToFile(key.content, 'llave.key', key.type));

  buscar('txtCertificate').value = 'certificado.cer';
  buscar('txtPrivateKey').value = 'llave.key';
  buscar('privateKeyPassword').value = password;

  return { okCert, okKey };
}

function submitFirma() {
  const docs = [document];
  document.querySelectorAll('iframe, frame').forEach((f) => {
    try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {}
  });
  let btn = null;
  for (const d of docs) {
    btn = d.getElementById('submit');
    if (btn) break;
  }
  if (!btn) throw new Error('No se encontró el botón de enviar');
  btn.click();
  return true;
}

/**
 * Corre el spike completo. `log` recibe líneas de progreso para la UI.
 * `conCredenciales` en false se queda en las pruebas de capacidad.
 */
export async function runSpike(log, conCredenciales = false) {
  // Los pasos principales se anuncian también sobre la página: con el webview
  // visible, la consola de la app queda tapada.
  const paso = (texto) => {
    log(texto);
    bridge.status(texto);
  };

  log('Abriendo webview con UA de escritorio…');
  await bridge.open(URL_LOGIN_FIEL, { visible: true });

  paso('Esperando el formulario de e.firma…');
  let espera = await esperarFormulario(log, 60000);
  log(`  resultado: ${espera.listo ? 'formulario listo' : 'sin formulario'} (${espera.esperado}ms)`);

  // La página puede abrir en la pestaña de contraseña; entonces los campos del
  // certificado no existen hasta hacer clic en buttonFiel.
  if (!espera.listo && espera.necesitaClic) {
    paso('Cambiando a la pestaña de e.firma…');
    const clic = await bridge.run(abrirPestanaFirma);
    log(`  clic en buttonFiel: ${clic.clicado} (${clic.donde || clic.motivo})`);
    espera = await esperarFormulario(log, 30000);
    log(`  resultado: ${espera.listo ? 'formulario listo' : 'sin formulario'} (${espera.esperado}ms)`);
  }

  const pagina = espera.pagina;
  if (!pagina) {
    log('✗ No se pudo sondear la página en ningún intento.');
    return { viable: false };
  }
  imprimirDiagnostico(log, pagina);
  log(`  ids encontrados: ${pagina.idsPresentes.join(', ') || '(ninguno)'}`);
  if (pagina.contextoFormulario) log(`  formulario en: ${pagina.contextoFormulario}`);

  paso('Probando inyección de archivos en WebKit…');
  const files = await bridge.run(probeFileInjection);
  log(`  DataTransfer disponible: ${files.dataTransferDisponible}`);
  log(`  input.files = dt.files:  ${files.setterFunciona}`);
  if (!files.setterFunciona) log(`  fallback defineProperty: ${files.fallbackFunciona}`);
  if (files.error) log(`  error: ${files.error}`);

  // Los dos supuestos se evalúan por separado: la inyección de archivos es el
  // riesgo arquitectónico; los ids son un detalle de navegación de la página.
  const inyeccionOk = files.setterFunciona || files.fallbackFunciona;
  const paginaOk = pagina.idsPresentes.length > 0;

  log(inyeccionOk
    ? '✓ Inyección de archivos soportada por WebKit.'
    : '✗ WebKit no permite inyectar archivos: el login con e.firma no es viable así.');
  log(paginaOk
    ? '✓ Formulario de e.firma accesible.'
    : '✗ No se alcanzó el formulario de e.firma (ver diagnóstico arriba).');

  const viable = inyeccionOk && paginaOk;
  if (!conCredenciales || !viable) {
    paso(viable ? 'Listo. Puedes revisar la página.' : 'Terminó con fallos, revisa la consola de la app.');
    return { pagina, files, viable };
  }

  paso('Inyectando e.firma real…');
  const cert = await readCredential('certificado.cer', 'Autoriza el uso de tu e.firma para iniciar sesión');
  const key = await readCredential('llave.key');
  const password = await readCredential('passwordCertificado');

  const filled = await bridge.run(fillFirma, [cert, key, password]);
  log(`  certificado: ${filled.okCert ? 'ok' : 'falló'} / llave: ${filled.okKey ? 'ok' : 'falló'}`);

  paso('Enviando formulario…');
  await bridge.run(submitFirma);

  // El login encadena redirecciones; se sondea desde la app hasta que la URL
  // deje de ser la de login o se agote el plazo.
  const inicio = Date.now();
  let despues = null;
  while (Date.now() - inicio < 60000) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      despues = await bridge.run(probePage, [], 8000);
      if (!despues.urlTop.includes('nidp/app/login')) break;
    } catch (e) {
      // Navegación en curso: se reintenta.
    }
  }

  if (!despues) {
    log('✗ No se pudo sondear la página tras enviar.');
    return { pagina, files, viable, autenticado: false };
  }

  log(`  URL tras login: ${despues.urlTop}`);
  const autenticado = !despues.urlTop.includes('nidp/app/login');
  paso(autenticado ? '✓ Login con e.firma completado.' : '✗ Sigue en la página de login.');

  return { pagina, files, viable, autenticado, urlFinal: despues.urlTop };
}

/** Vuelca el diagnóstico de todos los frames a la consola de la app. */
function imprimirDiagnostico(log, pagina) {
  log(`  URL top: ${pagina.urlTop}`);
  log(`  Viewport: ${pagina.innerWidth}px · frames: ${pagina.totalFrames}`);
  pagina.docs.forEach((d) => {
    if (!d.accesible) {
      log(`  [${d.contexto}] INACCESIBLE: ${d.error}`);
      return;
    }
    log(`  [${d.contexto}]`);
    log(`     url: ${d.url}`);
    log(`     título: ${d.title || '(vacío)'} · ${d.readyState} · ${d.largoTexto} chars`);
    if (d.textoInicio) log(`     texto: "${d.textoInicio}"`);
    log(`     inputs: ${d.inputs.join(', ') || '(ninguno)'}`);
    log(`     buttonFiel: ${d.tieneBotonFiel} · pestaña pwd: ${d.tienePassword} · e.firma: ${d.tieneFirma}`);
  });
}

/**
 * Re-sondea la página en el estado en que esté ahora mismo. Sirve cuando el
 * SAT tarda más de lo previsto o cuando se navegó a mano.
 */
export async function diagnosticar(log) {
  const pagina = await bridge.run(probePage);
  imprimirDiagnostico(log, pagina);
  log(`  ids encontrados: ${pagina.idsPresentes.join(', ') || '(ninguno)'}`);
  if (pagina.contextoFormulario) log(`  formulario en: ${pagina.contextoFormulario}`);
  return pagina;
}

/** Oculta el webview y devuelve el control a la app, sin destruir la sesión. */
export async function ocultar() {
  await bridge.hide();
}

/** Cierra el webview y libera los listeners. */
export async function cerrar() {
  await bridge.close();
}
