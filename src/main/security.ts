export function createContentSecurityPolicy(
  isDevelopment: boolean,
  developmentServerUrl?: string,
): string {
  const connectSource = createConnectSource(
    isDevelopment,
    developmentServerUrl,
  );
  const scriptSource = "'self'";
  const styleSource = isDevelopment ? "'self' 'unsafe-inline'" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSource}`,
    `style-src ${styleSource}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSource}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function createConnectSource(
  isDevelopment: boolean,
  developmentServerUrl: string | undefined,
): string {
  if (!isDevelopment || !developmentServerUrl) {
    return "'self'";
  }

  const serverUrl = new URL(developmentServerUrl);
  const webSocketProtocol = serverUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const webSocketOrigin = `${webSocketProtocol}//${serverUrl.host}`;

  return `'self' ${serverUrl.origin} ${webSocketOrigin}`;
}
