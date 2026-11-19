import { clipTab } from './clipper.js';

const status = document.getElementById('status');
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
document.getElementById('page-title').textContent = tab?.title ?? '';

async function save(mode) {
  status.textContent = 'Guardando…';
  status.className = '';
  try {
    const note = await clipTab(tab.id, mode);
    status.textContent = `Guardada: ${note.title}`;
    status.className = 'ok';
  } catch (error) {
    status.textContent = error.message;
    status.className = 'error';
  }
}

document
  .getElementById('save-page')
  .addEventListener('click', () => save('page'));
document
  .getElementById('save-selection')
  .addEventListener('click', () => save('selection'));
document.getElementById('open-options').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
