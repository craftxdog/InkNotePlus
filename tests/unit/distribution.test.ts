import { describe, expect, it } from 'vitest';
import { macSigningConfiguration } from '../../config/distribution';

describe('macOS artifact signing', () => {
  it('signs the completed local bundle instead of leaving Electron signatures invalid', () => {
    const config = macSigningConfiguration({});
    expect(config.osxSign).toMatchObject({
      identity: '-',
      identityValidation: false,
      strictVerify: true,
    });
    expect(config.osxSign.optionsForFile()).toMatchObject({
      hardenedRuntime: false,
      timestamp: 'none',
      entitlements: ['com.apple.security.cs.allow-jit'],
    });
    expect(config.osxNotarize).toBeUndefined();
  });
  it('uses a real signing identity and a keychain profile for notarized distributions', () => {
    const config = macSigningConfiguration({
      INKNOTE_MAC_SIGN_IDENTITY: 'Developer ID Application: Example (TESTTEAM)',
      INKNOTE_MAC_NOTARY_PROFILE: 'inknote-release',
    });
    expect(config.osxSign).toMatchObject({
      identityValidation: true,
      strictVerify: true,
    });
    expect(config.osxNotarize).toEqual({ keychainProfile: 'inknote-release' });
    expect(config.osxSign.optionsForFile().hardenedRuntime).toBe(true);
    expect(config.osxSign.optionsForFile().timestamp).toBeUndefined();
  });
  it('refuses notarization or release mode without a real signing identity', () => {
    expect(() =>
      macSigningConfiguration({ INKNOTE_MAC_NOTARY_PROFILE: 'release' }),
    ).toThrow();
    expect(() =>
      macSigningConfiguration({ INKNOTE_REQUIRE_SIGNING: '1' }),
    ).toThrow();
    expect(() =>
      macSigningConfiguration({
        INKNOTE_REQUIRE_SIGNING: '1',
        INKNOTE_MAC_SIGN_IDENTITY: '-',
      }),
    ).toThrow();
  });
});
