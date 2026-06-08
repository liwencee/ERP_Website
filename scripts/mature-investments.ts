/**
 * Standalone runner — delegates to src/jobs/mature-investments.ts
 * Usage: npx ts-node scripts/mature-investments.ts
 */
import { runMaturityJob } from '../src/jobs/mature-investments';

runMaturityJob()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
