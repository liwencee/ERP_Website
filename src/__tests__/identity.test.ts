/**
 * IDENTITY / DUPLICATE-ACCOUNT TESTS
 * Pure-function checks for the helpers that stop one person opening many accounts.
 */
import { canonicalEmail, normalizePhone, isDisposableEmail, selfReferralSignal } from '../utils/identity';

describe('canonicalEmail', () => {
  it('lowercases and trims', () => {
    expect(canonicalEmail('  Jane@Example.COM ')).toBe('jane@example.com');
  });

  it('strips +tags on any domain', () => {
    expect(canonicalEmail('jane+promo2@example.com')).toBe('jane@example.com');
  });

  it('removes dots for Gmail only', () => {
    expect(canonicalEmail('j.a.n.e@gmail.com')).toBe('jane@gmail.com');
    expect(canonicalEmail('j.a.n.e@example.com')).toBe('j.a.n.e@example.com');
  });

  it('treats googlemail.com as gmail.com', () => {
    expect(canonicalEmail('j.ane+x@googlemail.com')).toBe('jane@gmail.com');
  });

  it('makes all the Gmail tricks collide', () => {
    const variants = ['jane@gmail.com', 'Jane@Gmail.com', 'j.ane@gmail.com', 'jane+1@gmail.com', 'ja.ne+abc@googlemail.com'];
    expect(new Set(variants.map(canonicalEmail)).size).toBe(1);
  });

  it('keeps genuinely different people apart', () => {
    expect(canonicalEmail('jane@gmail.com')).not.toBe(canonicalEmail('jan@gmail.com'));
  });
});

describe('normalizePhone', () => {
  it('matches local, +234 and 234 forms of the same number', () => {
    const forms = ['08031234567', '+2348031234567', '2348031234567', '0803 123 4567', '(0803)-123-4567', '002348031234567'];
    expect(new Set(forms.map(normalizePhone))).toEqual(new Set(['8031234567']));
  });

  it('rejects numbers that are too short or too long', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('1'.repeat(16))).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });

  it('keeps different numbers different', () => {
    expect(normalizePhone('08031234567')).not.toBe(normalizePhone('08031234568'));
  });
});

describe('isDisposableEmail', () => {
  it('flags throwaway providers and their subdomains', () => {
    expect(isDisposableEmail('x@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@YOPMAIL.com')).toBe(true);
    expect(isDisposableEmail('x@foo.mailinator.com')).toBe(true);
  });

  it('allows normal providers', () => {
    expect(isDisposableEmail('x@gmail.com')).toBe(false);
    expect(isDisposableEmail('x@company.ng')).toBe(false);
    expect(isDisposableEmail('not-an-email')).toBe(false);
  });
});

describe('selfReferralSignal', () => {
  it('links accounts sharing a phone, bank account or signup IP', () => {
    expect(selfReferralSignal({ phoneNormalized: '8031234567' }, { phoneNormalized: '8031234567' })).toMatch(/phone/);
    expect(selfReferralSignal({ bankAccountNumber: '0123456789' }, { bankAccountNumber: '0123456789' })).toMatch(/bank/);
    expect(selfReferralSignal({ signupIp: '1.2.3.4' }, { signupIp: '1.2.3.4' })).toMatch(/IP/);
  });

  it('does not link on missing data', () => {
    expect(selfReferralSignal({}, {})).toBeNull();
    expect(selfReferralSignal({ signupIp: null }, { signupIp: null })).toBeNull();
  });

  it('does not link unrelated people', () => {
    expect(selfReferralSignal(
      { phoneNormalized: '8031234567', signupIp: '1.1.1.1', bankAccountNumber: '111' },
      { phoneNormalized: '8039999999', signupIp: '2.2.2.2', bankAccountNumber: '222' },
    )).toBeNull();
  });
});
