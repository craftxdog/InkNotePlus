// Keep startup failures observable even if a dependency fails before React mounts.
void import('./renderer').catch((error: unknown) => {
  console.error('InkNote renderer failed to start:', error);
  document.documentElement.dataset.theme = 'startup-error';
  const root = document.getElementById('root');
  if (root)
    root.textContent =
      'InkNote no pudo iniciar. Cierra y vuelve a abrir la aplicación.';
});
