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

/** Diagnóstico de la página: sirve para ver en qué estado real estamos. */
function probePage() {
  const ids = [
    'fileCertificate',
    'filePrivateKey',
    'txtCertificate',
    'txtPrivateKey',
    'privateKeyPassword',
    'submit',
  ];
  const texto = document.body ? document.body.innerText || '' : '';
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    largoTexto: texto.length,
    textoInicio: texto.trim().slice(0, 200),
    innerWidth: window.innerWidth,
    userAgent: navigator.userAgent,
    // Pestañas del login del SAT.
    tienePassword: texto.includes('Acceso por contraseña'),
    tieneFirma: texto.includes('Acceso con e.firma'),
    tieneBotonFiel: document.getElementById('buttonFiel') !== null,
    // Inventario para descubrir ids nuevos si el SAT cambió la página.
    inputsEnPagina: Array.from(document.querySelectorAll('input'))
      .map((el) => el.id || `(sin id, type=${el.type})`)
      .slice(0, 25),
    idsPresentes: ids.filter((id) => document.getElementById(id) !== null),
    idsFaltantes: ids.filter((id) => document.getElementById(id) === null),
  };
}

/**
 * Espera a que la página tenga contenido real. El evento de carga del webview
 * se dispara antes de que el SAT termine de pintar, así que hay que sondear.
 */
function esperarContenido() {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const revisar = () => {
      const texto = document.body ? document.body.innerText || '' : '';
      const listo = document.readyState === 'complete' && texto.trim().length > 50;
      if (listo || Date.now() - inicio > 15000) {
        resolve({ listo, esperado: Date.now() - inicio });
        return;
      }
      setTimeout(revisar, 250);
    };
    revisar();
  });
}

/**
 * Cambia a la pestaña de e.firma. Los campos del certificado no existen en el
 * DOM hasta que se hace este clic: la página abre en "Acceso por contraseña".
 */
function abrirPestanaFirma() {
  const btn = document.getElementById('buttonFiel');
  if (!btn) return { clicado: false, motivo: 'no existe buttonFiel' };
  btn.click();
  return { clicado: true };
}

/** Espera a que aparezcan los campos del certificado tras cambiar de pestaña. */
function esperarCamposFirma() {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const revisar = () => {
      const hay = document.getElementById('fileCertificate') !== null;
      if (hay || Date.now() - inicio > 10000) {
        resolve({ hay, esperado: Date.now() - inicio });
        return;
      }
      setTimeout(revisar, 250);
    };
    revisar();
  });
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

  function setFile(inputId, file) {
    const input = document.getElementById(inputId);
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

  document.getElementById('txtCertificate').value = 'certificado.cer';
  document.getElementById('txtPrivateKey').value = 'llave.key';
  document.getElementById('privateKeyPassword').value = password;

  return { okCert, okKey };
}

function submitFirma() {
  const btn = document.getElementById('submit');
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

  paso('Puente activo. Esperando a que la página pinte…');
  const espera = await bridge.run(esperarContenido, [], 20000);
  log(`  contenido listo: ${espera.listo} (${espera.esperado}ms)`);

  let pagina = await bridge.run(probePage);
  log(`  URL:      ${pagina.url}`);
  log(`  Título:   ${pagina.title || '(vacío)'}`);
  log(`  Estado:   ${pagina.readyState}, ${pagina.largoTexto} chars de texto`);
  log(`  Viewport: ${pagina.innerWidth}px`);
  if (pagina.textoInicio) log(`  Texto:    "${pagina.textoInicio.replace(/\s+/g, ' ')}"`);
  log(`  Pestaña contraseña: ${pagina.tienePassword} · e.firma: ${pagina.tieneFirma} · buttonFiel: ${pagina.tieneBotonFiel}`);
  log(`  inputs en la página: ${pagina.inputsEnPagina.join(', ') || '(ninguno)'}`);

  // La página abre en la pestaña de contraseña; los campos del certificado no
  // existen hasta que se cambia de pestaña.
  if (!pagina.idsPresentes.length && pagina.tieneBotonFiel) {
    paso('Cambiando a la pestaña de e.firma…');
    const clic = await bridge.run(abrirPestanaFirma);
    log(`  clic en buttonFiel: ${clic.clicado}${clic.motivo ? ' (' + clic.motivo + ')' : ''}`);
    const campos = await bridge.run(esperarCamposFirma, [], 15000);
    log(`  campos visibles: ${campos.hay} (${campos.esperado}ms)`);
    pagina = await bridge.run(probePage);
  }

  log(`  ids encontrados: ${pagina.idsPresentes.join(', ') || '(ninguno)'}`);
  if (pagina.idsFaltantes.length) log(`  ids FALTANTES:   ${pagina.idsFaltantes.join(', ')}`);

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
  const navegacion = bridge.waitForLoad(60000);
  await bridge.run(submitFirma);
  await navegacion;
  await bridge.run(esperarContenido, [], 20000);

  const despues = await bridge.run(probePage);
  log(`  URL tras login: ${despues.url}`);
  const autenticado = !despues.url.includes('nidp/app/login');
  paso(autenticado ? '✓ Login con e.firma completado.' : '✗ Sigue en la página de login.');

  return { pagina, files, viable, autenticado, urlFinal: despues.url };
}

/** Oculta el webview y devuelve el control a la app, sin destruir la sesión. */
export async function ocultar() {
  await bridge.hide();
}

/** Cierra el webview y libera los listeners. */
export async function cerrar() {
  await bridge.close();
}
