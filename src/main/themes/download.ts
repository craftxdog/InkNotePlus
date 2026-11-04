import { isIP } from 'node:net';

export async function downloadThemeResource(
  fetcher: typeof fetch,
  initial: string,
  maxBytes: number,
): Promise<Uint8Array> {
  let url = new URL(initial);
  if (url.origin !== 'https://api.inkdrop.app')
    throw new Error('invalid_package');
  const signal = AbortSignal.timeout(20_000);
  for (let hop = 0; hop < 6; hop++) {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      isIP(url.hostname) ||
      !url.hostname.includes('.') ||
      /\.(?:local|localhost|internal)$/i.test(url.hostname)
    )
      throw new Error('invalid_package');
    const response = await fetcher(url.href, {
      signal,
      redirect: 'manual',
      credentials: 'omit',
      headers:
        url.origin === 'https://api.inkdrop.app'
          ? { 'X-CLIENT-VERSION': '6.0.0' }
          : {},
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirect = response.headers.get('location');
      await response.body?.cancel();
      if (!redirect) throw new Error('unavailable');
      url = new URL(redirect, url);
      continue;
    }
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length')) > maxBytes
    ) {
      await response.body?.cancel();
      throw new Error('unavailable');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error('invalid_package');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
  throw new Error('unavailable');
}
