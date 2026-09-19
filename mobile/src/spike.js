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

/** 1+2: entorno de la página y presencia de los ids del formulario de e.firma. */
function probeEnvironment() {
  const ids = [
    'fileCertificate',
    'filePrivateKey',
    'txtCertificate',
    'txtPrivateKey',
    'privateKeyPassword',
    'submit',
  ];
  return {
    userAgent: navigator.userAgent,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    title: document.title,
    url: location.href,
    idsPresentes: ids.filter((id) => document.getElementById(id) !== null),
    idsFaltantes: ids.filter((id) => document.getElementById(id) === null),
  };
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
  log('Abriendo webview oculto con UA de escritorio…');
  await bridge.open(URL_LOGIN_FIEL);

  log('Puente activo. Sondeando la página…');
  const env = await bridge.run(probeEnvironment);
  log(`  URL:      ${env.url}`);
  log(`  Título:   ${env.title}`);
  log(`  Viewport: ${env.innerWidth}x${env.innerHeight}`);
  log(`  UA:       ${env.userAgent.slice(0, 60)}…`);
  log(`  ids encontrados: ${env.idsPresentes.join(', ') || '(ninguno)'}`);
  if (env.idsFaltantes.length) log(`  ids FALTANTES:   ${env.idsFaltantes.join(', ')}`);

  log('Probando inyección de archivos en WebKit…');
  const files = await bridge.run(probeFileInjection);
  log(`  DataTransfer disponible: ${files.dataTransferDisponible}`);
  log(`  input.files = dt.files:  ${files.setterFunciona}`);
  if (!files.setterFunciona) log(`  fallback defineProperty: ${files.fallbackFunciona}`);
  if (files.error) log(`  error: ${files.error}`);

  const viable = env.idsPresentes.length > 0 && (files.setterFunciona || files.fallbackFunciona);
  log(viable ? '✓ Arquitectura viable.' : '✗ Arquitectura NO viable con este enfoque.');

  if (!conCredenciales || !viable) return { env, files, viable };

  log('Inyectando e.firma real…');
  const cert = await readCredential('certificado.cer', 'Autoriza el uso de tu e.firma para iniciar sesión');
  const key = await readCredential('llave.key');
  const password = await readCredential('passwordCertificado');

  const filled = await bridge.run(fillFirma, [cert, key, password]);
  log(`  certificado: ${filled.okCert ? 'ok' : 'falló'} / llave: ${filled.okKey ? 'ok' : 'falló'}`);

  log('Enviando formulario…');
  const navegacion = bridge.waitForLoad(60000);
  await bridge.run(submitFirma);
  await navegacion;

  const despues = await bridge.run(probeEnvironment);
  log(`  URL tras login: ${despues.url}`);
  const autenticado = !despues.url.includes('nidp/app/login');
  log(autenticado ? '✓ Login con e.firma completado.' : '✗ Sigue en la página de login.');

  return { env, files, viable, autenticado, urlFinal: despues.url };
}

export async function cerrar() {
  await bridge.close();
}
