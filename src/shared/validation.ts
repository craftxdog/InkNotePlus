import { z } from 'zod';

// Configure before constructing schemas: Zod's JIT probe itself violates
// script-src 'self', even when its caught exception falls back to interpretation.
// https://zod.dev/compile#content-security-policy
z.config({ jitless: true });

export { z };
