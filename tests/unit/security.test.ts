import { describe, expect, it } from 'vitest';

import { createContentSecurityPolicy } from '../../src/main/security';

describe('createContentSecurityPolicy', () => {
  it('does not allow development servers in production', () => {
    const policy = createContentSecurityPolicy(false);

    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain('localhost');
    expect(policy).not.toContain("'unsafe-inline'");
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
