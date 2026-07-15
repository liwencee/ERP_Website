import assert from 'node:assert';
import { computeTenureChange } from './tenure';

function run(): void {
  const start = new Date('2026-01-01T00:00:00Z');
  const now = new Date('2026-02-01T00:00:00Z'); // one month into the hold

  // 1. Extend to a longer, future tenure: return + maturity recomputed from start.
  const r1 = computeTenureChange(start, 100000, 30, 365, now);
  assert.strictEqual(r1.expectedReturn, 130000, 'principal + 30%');
  assert.strictEqual(r1.maturityDate.toISOString().slice(0, 10), '2027-01-01', 'start + 365d');

  // 2. Switch to a shorter BUT still-future tenure is allowed.
  const r2 = computeTenureChange(start, 50000, 12, 180, now);
  assert.strictEqual(r2.expectedReturn, 56000, 'principal + 12%');
  assert.strictEqual(r2.maturityDate.toISOString().slice(0, 10), '2026-06-30', 'start + 180d');

  // 3. A tenure whose maturity is already in the past is rejected.
  assert.throws(
    () => computeTenureChange(start, 50000, 12, 10, now),
    /already held this investment longer/,
    'past maturity must throw'
  );

  // 4. Maturity exactly equal to now (<=) is rejected.
  assert.throws(
    () => computeTenureChange(start, 1000, 5, 30, new Date('2026-01-31T00:00:00Z')),
    /already held this investment longer/,
    'maturity == now must throw'
  );

  console.log('All tenure computation checks passed.');
}

run();
