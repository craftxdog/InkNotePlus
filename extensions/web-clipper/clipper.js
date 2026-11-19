// Shared by the popup, the options page and the service worker.
export const defaults = { port: 19840, password: '', tags: 'web' };

export async function readSettings() {
  return {
    ...defaults,
    ...(await chrome.storage.local.get(Object.keys(defaults))),
  };
}

export const extensionOrigin = () => `chrome-extension://${chrome.runtime.id}`;

const messages = {
  401: 'InkNote rechazó la contraseña. Revísala en las opciones.',
  403: 'Autoriza esta extensión en InkNote, en Preferencias > Integraciones.',
  413: 'La página es demasiado grande para guardarla.',
};

export async function callInkNote(path, settings, body) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${settings.port}${path}`, {
      method: body ? 'POST' : 'GET',
      credentials: 'omit',
      headers: {
        authorization: `Basic ${btoa(`inknote:${settings.password}`)}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      'No se pudo conectar. Abre InkNote y activa el servidor local.',
    );
  }
  if (!response.ok)
    throw new Error(
      messages[response.status] ??
        `InkNote respondió con el error ${response.status}.`,
    );
  return response.json();
}

// Runs inside the page, so it must not use anything from this module.
export function extractPage(mode) {
  const selection = getSelection();
  let root;
  if (mode === 'selection' && selection && !selection.isCollapsed) {
    root = document.createElement('div');
    for (let index = 0; index < selection.rangeCount; index++)
      root.append(selection.getRangeAt(index).cloneContents());
  } else {
    const main =
      document.querySelector('article') ??
      document.querySelector('main') ??
      document.body;
    root = main.cloneNode(true);
    root
      .querySelectorAll(
        'script, style, noscript, iframe, nav, footer, form, button, dialog, template',
      )
      .forEach((element) => element.remove());
  }
  // Relative links and images must keep working outside the page.
  root.querySelectorAll('img[src]').forEach((image) => {
    image.setAttribute(
      'src',
      new URL(image.getAttribute('src'), location.href).href,
    );
    image.removeAttribute('srcset');
  });
  root.querySelectorAll('a[href]').forEach((link) => {
    link.setAttribute(
      'href',
      new URL(link.getAttribute('href'), location.href).href,
    );
  });
  return {
    url: location.href,
    title: document.title,
    html: root.innerHTML.slice(0, 1_800_000),
  };
}

export async function clipTab(tabId, mode) {
  const settings = await readSettings();
  if (!settings.password)
    throw new Error('Añade la contraseña de InkNote en las opciones.');
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPage,
      args: [mode],
    });
  } catch {
    throw new Error('El navegador no permite leer esta página.');
  }
  if (!/^https?:/.test(result.url))
    throw new Error('Solo se pueden guardar páginas web.');
  const tags = settings.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return callInkNote('/clip', settings, {
    ...result,
    ...(tags.length ? { tags } : {}),
  });
}
