import { callInkNote, extensionOrigin, readSettings } from './clipper.js';

const field = (id) => document.getElementById(id);
const status = field('status');
const show = (text, kind = '') => {
  status.textContent = text;
  status.className = kind;
};

field('origin').textContent = extensionOrigin();
const settings = await readSettings();
field('port').value = settings.port;
field('password').value = settings.password;
field('tags').value = settings.tags;

const current = () => ({
  port: Number(field('port').value),
  password: field('password').value,
  tags: field('tags').value,
});

field('copy-origin').addEventListener('click', async () => {
  await navigator.clipboard.writeText(extensionOrigin());
  show('Origen copiado.', 'ok');
});
field('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.local.set(current());
  show('Guardado.', 'ok');
});
field('test').addEventListener('click', async () => {
  try {
    const info = await callInkNote('/', current());
    show(`Conectado con ${info.name} ${info.version}.`, 'ok');
  } catch (error) {
    show(error.message, 'error');
  }
});
