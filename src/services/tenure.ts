import { addDays } from '../utils/helpers';

export interface TenureChangeComputation {
  expectedReturn: number;
  maturityDate: Date;
}

// Pure calculation for changing an investment's tenure.
// - maturityDate is measured from the ORIGINAL start date (not "now"), so the
//   total lock period matches the chosen tenure.
// - expectedReturn = principal + principal * newReturnRate% (2dp).
// Throws when the recomputed maturity is not strictly in the future — that would
// be an early withdrawal, which is out of scope for a tenure change.
export function computeTenureChange(
  startDate: Date,
  principal: number,
  newReturnRate: number,
  newDurationDays: number,
  now: Date = new Date()
): TenureChangeComputation {
  const maturityDate = addDays(startDate, newDurationDays);
  if (maturityDate.getTime() <= now.getTime()) {
    throw new Error(
      'You have already held this investment longer than the selected tenure. Choose a tenure that matures in the future.'
    );
  }
  const expectedReturn = parseFloat((principal * (1 + newReturnRate / 100)).toFixed(2));
  return { expectedReturn, maturityDate };
}
