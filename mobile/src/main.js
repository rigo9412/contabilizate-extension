/**
 * UI mínima del spike. La UI completa se porta desde index.html de la
 * extensión una vez validada la arquitectura.
 */
import { saveCredentialFile, savePassword, credentialStatus, clearCredentials, lock } from './secure-store.js';
import { runSpike, cerrar } from './spike.js';

const $ = (id) => document.getElementById(id);

function log(linea) {
  const salida = $('log');
  salida.textContent += linea + '\n';
  salida.scrollTop = salida.scrollHeight;
}

async function refrescarEstado() {
  const estado = await credentialStatus();
  const pinta = (id, ok) => {
    const el = $(id);
    el.textContent = ok ? 'Cargado' : 'No cargado';
    el.className = 'badge ' + (ok ? 'bg-success' : 'bg-secondary');
  };
  pinta('estadoCert', estado['certificado.cer']);
  pinta('estadoKey', estado['llave.key']);
  pinta('estadoPassword', estado['passwordCertificado']);
}

$('formCredenciales').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const cert = $('inputCert').files[0];
    const key = $('inputKey').files[0];
    const password = $('inputPassword').value;

    if (cert) await saveCredentialFile(cert, 'certificado.cer');
    if (key) await saveCredentialFile(key, 'llave.key');
    if (password.trim()) await savePassword(password);

    $('inputPassword').value = '';
    await refrescarEstado();
    log('Credenciales guardadas en el Keychain.');
  } catch (err) {
    log('Error guardando credenciales: ' + err.message);
  }
});

$('btnBorrar').addEventListener('click', async () => {
  await clearCredentials();
  await refrescarEstado();
  log('Credenciales borradas del Keychain.');
});

$('btnSpike').addEventListener('click', () => ejecutar(false));
$('btnSpikeLogin').addEventListener('click', () => ejecutar(true));

async function ejecutar(conCredenciales) {
  $('log').textContent = '';
  $('btnSpike').disabled = true;
  $('btnSpikeLogin').disabled = true;
  try {
    await runSpike(log, conCredenciales);
  } catch (err) {
    log('✗ ' + err.message);
  } finally {
    await cerrar().catch(() => {});
    $('btnSpike').disabled = false;
    $('btnSpikeLogin').disabled = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) lock();
});

refrescarEstado();
