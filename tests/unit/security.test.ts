import { describe, expect, it } from 'vitest';

import { createContentSecurityPolicy } from '../../src/main/security';

describe('createContentSecurityPolicy', () => {
  it('keeps Vite styles usable when the main process also provides an editor nonce', () => {
    const policy = createContentSecurityPolicy(
      true,
      'http://localhost:5173',
      'testNonce012345678901234567890123',
    );
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    // CSP ignores unsafe-inline if a nonce is also present in the source list.
    expect(policy).not.toContain('nonce-');
    expect(policy).toContain("script-src 'self'");
  });
  it('does not allow development servers in production', () => {
    const policy = createContentSecurityPolicy(false);

    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain('localhost');
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).not.toContain("style-src 'self' 'unsafe-inline'");
  });

  it('allows only local Vite connections during development without inline scripts', () => {
    const policy = createContentSecurityPolicy(true, 'http://localhost:5174');

    expect(policy).toContain('ws://localhost:5174');
    expect(policy).toContain('http://localhost:5174');
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });
});
