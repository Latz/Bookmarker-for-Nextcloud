import { it } from 'vitest';

// Wall-clock assertions can't hold under Stryker's instrumentation (several
// times slower), so skip them in its workers; Stryker's own timeout still
// catches mutants that hang.
export const timed = process.env.STRYKER_MUTATOR_WORKER ? it.skip : it;
