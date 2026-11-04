// Forge signs after plist updates, fuses and ASAR integrity metadata are final.
// https://www.electronforge.io/guides/code-signing/code-signing-macos
export function macSigningConfiguration(environment: NodeJS.ProcessEnv) {
  const configuredIdentity = environment.INKNOTE_MAC_SIGN_IDENTITY?.trim();
  const identity =
    configuredIdentity && configuredIdentity !== '-'
      ? configuredIdentity
      : undefined;
  const profile = environment.INKNOTE_MAC_NOTARY_PROFILE?.trim();
  if ((profile || environment.INKNOTE_REQUIRE_SIGNING === '1') && !identity) {
    throw new Error(
      'A Developer ID Application identity is required for a signed release or notarization. Configure INKNOTE_MAC_SIGN_IDENTITY.',
    );
  }
  return {
    osxSign: {
      identity: identity ?? '-',
      identityValidation: !!identity,
      strictVerify: true,
      preAutoEntitlements: !!identity,
      preEmbedProvisioningProfile: false,
      optionsForFile: () => ({
        // Library validation requires a real Team ID. Ad-hoc local builds have none.
        // Developer ID releases keep the hardened runtime required by notarization.
        // https://developer.apple.com/documentation/security/resolving-common-notarization-issues
        hardenedRuntime: !!identity,
        entitlements: ['com.apple.security.cs.allow-jit'],
        timestamp: identity ? undefined : 'none',
      }),
    },
    osxNotarize: profile ? { keychainProfile: profile } : undefined,
  };
}
