import { z } from 'zod';

// The pages' CSP has no 'unsafe-eval'. zod probes for it with a `new Function` when a schema is built,
// and a strict CSP reports even that caught probe as a violation. jitless skips the probe, and the
// parse is the same, only without the generated fast path. Import this before anything builds a schema.
z.config({ jitless: true });
