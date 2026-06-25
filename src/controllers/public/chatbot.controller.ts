import { Request, Response } from 'express';
import prisma from '../../config/database';

const PLAN_ORDER = ['Save Future', 'Silver', 'Bronze', 'Gold', 'Diamond', 'Fixed Deposit', 'Trading', 'Dollar', 'Real Estate'];

const CONTACT_TEXT =
  'You can reach our team directly:\n' +
  '📞 (+234) 803-666-0392 / (+234) 810-333-0394\n' +
  '✉️ info@epraaccess.com\n' +
  '📍 54b Adeniyi Jones, Ikeja 101233, Lagos';

const MAIN_MENU = [
  'Investment plans & rates',
  'Suggest a plan for my budget',
  'How do I open an account?',
  'Is EPR Access regulated?',
  'Talk to a human',
];

interface ChatReply {
  reply: string;
  quickReplies?: string[];
  link?: { label: string; href: string };
}

interface PlanWithTenures {
  id: string;
  name: string;
  description: string;
  minAmount: any;
  maxAmount: any;
  returnRate: any;
  tenures: { label: string; returnRate: any }[];
}

function rateRange(plan: PlanWithTenures): string {
  if (plan.tenures && plan.tenures.length) {
    const rates = plan.tenures.map((t) => Number(t.returnRate));
    const lo = Math.min(...rates);
    const hi = Math.max(...rates);
    return lo === hi ? `${lo}%` : `${lo}%–${hi}%`;
  }
  return `${Number(plan.returnRate)}%`;
}

function topRate(plan: PlanWithTenures): number {
  if (plan.tenures && plan.tenures.length) {
    return Math.max(...plan.tenures.map((t) => Number(t.returnRate)));
  }
  return Number(plan.returnRate);
}

function fmtNaira(n: number): string {
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

function sortPlans<T extends { name: string }>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const ai = PLAN_ORDER.findIndex((k) => a.name.includes(k));
    const bi = PLAN_ORDER.findIndex((k) => b.name.includes(k));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function shortName(plan: PlanWithTenures): string {
  for (const key of PLAN_ORDER) {
    if (plan.name.includes(key)) return key === 'Save Future' ? 'Savings' : key;
  }
  return plan.name;
}

function parseAmount(message: string): number | null {
  const cleaned = message.replace(/,/g, '');
  const match = cleaned.match(/(?:₦|ngn|naira)?\s*(\d+(?:\.\d+)?)\s*(k|m|mil|million|thousand)?/i);
  if (!match) return null;
  let num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'k' || suffix === 'thousand') num *= 1_000;
  if (suffix === 'm' || suffix === 'mil' || suffix === 'million') num *= 1_000_000;
  // Ignore plain numbers that look like Nigerian phone numbers (e.g. 08031234567)
  if (!suffix && /^0\d{9,10}$/.test(match[1])) return null;
  if (num < 1000) return null;
  return num;
}

const PLAN_KEYWORDS: { keys: RegExp; match: string }[] = [
  { keys: /\bsaving/i, match: 'Save Future' },
  { keys: /\bsilver\b/i, match: 'Silver' },
  { keys: /\bbronze\b/i, match: 'Bronze' },
  { keys: /\bgold\b/i, match: 'Gold' },
  { keys: /\bdiamond\b/i, match: 'Diamond' },
  { keys: /\bfixed\s*deposit\b/i, match: 'Fixed Deposit' },
  { keys: /\btrading|forex|crypto/i, match: 'Trading' },
  { keys: /\bdollar|usd|\$/i, match: 'Dollar' },
  { keys: /\breal\s*estate|propert/i, match: 'Real Estate' },
];

function greeting(): ChatReply {
  return {
    reply:
      "👋 Hi! I'm the EPR Assistant. I can help with investment plans & rates, account setup, KYC, withdrawals, referrals and more — what would you like to know?",
    quickReplies: MAIN_MENU,
  };
}

function fallback(): ChatReply {
  return {
    reply: "I'm not 100% sure I caught that. Here's what I can help with:",
    quickReplies: MAIN_MENU,
  };
}

function listPlans(plans: PlanWithTenures[]): ChatReply {
  const lines = plans.map((p) => `• ${p.name} — ${rateRange(p)} return, min ${fmtNaira(Number(p.minAmount))}`);
  return {
    reply: `Here are our current investment packages:\n\n${lines.join('\n')}\n\nAsk about any plan by name, or tell me your budget for a personalised suggestion.`,
    quickReplies: ['Suggest a plan for my budget', 'How do I open an account?'],
  };
}

function describePlan(plan: PlanWithTenures): ChatReply {
  const lines: string[] = [];
  lines.push(plan.description);
  lines.push('');
  lines.push(`Returns: ${rateRange(plan)}`);
  lines.push(
    `Minimum: ${fmtNaira(Number(plan.minAmount))}` +
      (plan.maxAmount ? ` · Maximum: ${fmtNaira(Number(plan.maxAmount))}` : '')
  );
  if (plan.tenures && plan.tenures.length) {
    lines.push('');
    lines.push('Tenures:');
    plan.tenures.forEach((t) => lines.push(`• ${t.label} — ${Number(t.returnRate)}%`));
  }
  return {
    reply: lines.join('\n'),
    quickReplies: ['How do I open an account?', 'Suggest a plan for my budget'],
    link: { label: 'Open an Account', href: '/auth/register' },
  };
}

function suggestForAmount(plans: PlanWithTenures[], amount: number): ChatReply {
  const eligible = plans.filter((p) => {
    const min = Number(p.minAmount);
    const max = p.maxAmount ? Number(p.maxAmount) : null;
    // Inclusive [min, max]; bands don't share endpoints (Bronze min is
    // ₦5,000,001, not ₦5,000,000) so each amount matches exactly one tier.
    return amount >= min && (max === null || amount <= max);
  });

  if (!eligible.length) {
    const cheapest = plans.reduce((a, b) => (Number(a.minAmount) < Number(b.minAmount) ? a : b));
    return {
      reply:
        `With ${fmtNaira(amount)} you're just below our entry point. Our most accessible package is ${cheapest.name} ` +
        `(minimum ${fmtNaira(Number(cheapest.minAmount))}, returns ${rateRange(cheapest)}) — start there and top up anytime.`,
      quickReplies: ['Investment plans & rates', 'How do I open an account?'],
      link: { label: 'Open an Account', href: '/auth/register' },
    };
  }

  const best = eligible.reduce((a, b) => (topRate(b) > topRate(a) ? b : a));
  const others = eligible.filter((p) => p.id !== best.id).slice(0, 2);

  let txt =
    `With ${fmtNaira(amount)}, our best fit is ${best.name} — returns ${rateRange(best)} ` +
    `(min ${fmtNaira(Number(best.minAmount))}${best.maxAmount ? ', max ' + fmtNaira(Number(best.maxAmount)) : ''}).`;

  if (others.length) {
    txt += `\n\nYou'd also qualify for:\n` + others.map((p) => `• ${p.name} — ${rateRange(p)}`).join('\n');
  }

  return {
    reply: txt,
    quickReplies: [`Tell me more about ${shortName(best)}`, 'How do I open an account?'],
    link: { label: 'Open an Account', href: '/auth/register' },
  };
}

export async function reply(req: Request, res: Response): Promise<void> {
  const raw = (req.body?.message || '').toString().trim().slice(0, 300);
  const msg = raw.toLowerCase();

  const plans = sortPlans(
    await prisma.investmentPlan.findMany({
      where: { status: 'ACTIVE' },
      include: { tenures: { orderBy: { sortOrder: 'asc' } } },
    })
  ) as unknown as PlanWithTenures[];

  let result: ChatReply;

  if (!raw) {
    result = greeting();
  } else if (/^(thanks|thank you|thx|cheers|bye|goodbye|see ya|ok|okay)\b/.test(msg)) {
    result = {
      reply: "You're welcome! 😊 Feel free to come back anytime — I'm here 24/7. Wishing you great returns with EPR Access Limited!",
    };
  } else if (/^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|start)\b/.test(msg)) {
    result = greeting();
  } else if (/contact|phone|call|email|address|office|agent|\bhuman\b|support|whatsapp|speak to/i.test(msg)) {
    result = {
      reply: CONTACT_TEXT,
      quickReplies: ['Investment plans & rates', 'How do I open an account?'],
      link: { label: 'Chat on WhatsApp', href: 'https://wa.me/2348036660392' },
    };
  } else if (/regulat|complian|legit|scam|safe|\bcac\b|licen[cs]e|trust|registered/i.test(msg)) {
    result = {
      reply:
        'EPR Access Limited is a registered Nigerian Capital Market Operator, Asset Manager and Investment Firm — RC No: 8851262, CAC registered.\n\nWe make capital work intelligently, with rigorous research, diversified allocation and active risk management.',
      quickReplies: ['Investment plans & rates', 'Talk to a human'],
      link: { label: 'View Compliance Page', href: '/compliance' },
    };
  } else if (/\bkyc\b|verif|identity|\bid\b|document/i.test(msg)) {
    result = {
      reply:
        'To get fully verified:\n1. Log in to your dashboard\n2. Go to Profile / KYC\n3. Upload a valid ID and proof of address\n\nVerified accounts unlock higher limits and faster withdrawals. Our team reviews submissions promptly.',
      quickReplies: ['How do I open an account?', 'Talk to a human'],
    };
  } else if (/referr|invite|affiliate|commission/i.test(msg)) {
    result = {
      reply:
        'Every account gets a unique referral code. Share it with friends — when they invest, you earn a referral bonus (typically 0.65%–3% of their investment, depending on the plan). Find your code under Dashboard → Referrals.',
      quickReplies: ['Investment plans & rates', 'How do I open an account?'],
    };
  } else if (/withdraw|cash\s*out|payout|redeem/i.test(msg)) {
    result = {
      reply:
        'Withdrawals are simple:\n• Fixed-tenure plans (Silver, Bronze, Gold, Diamond, Fixed Deposit, Trading, Dollar, Real Estate) pay principal + returns to your wallet automatically at maturity.\n• Savings Plan can be withdrawn any time — early withdrawal returns your principal only (no interest).\n\nManage it all from Dashboard → Investments.',
      quickReplies: ['How do I open an account?', 'Talk to a human'],
    };
  } else if (/sign\s*up|register|open an account|create an account|get started|\bjoin\b/i.test(msg)) {
    result = {
      reply:
        "Opening an account takes about 2 minutes:\n1. Tap Register\n2. Enter your name, email, phone & password\n3. You're verified instantly — log in and fund your wallet to start investing (from as little as ₦10,000).",
      quickReplies: ['Investment plans & rates', 'Suggest a plan for my budget'],
      link: { label: 'Create Account', href: '/auth/register' },
    };
  } else if (/log\s*in|sign\s*in|my account|my dashboard/i.test(msg)) {
    result = {
      reply: 'You can log in to your dashboard here:',
      quickReplies: ['How do I open an account?'],
      link: { label: 'Login', href: '/auth/login' },
    };
  } else {
    const planMatch = PLAN_KEYWORDS.find((pk) => pk.keys.test(msg));
    const plan = planMatch ? plans.find((p) => p.name.includes(planMatch.match)) : undefined;

    if (plan) {
      result = describePlan(plan);
    } else if (/minimum|how much.*(start|need|invest)|smallest/i.test(msg)) {
      const lines = plans.map((p) => `• ${p.name} — min ${fmtNaira(Number(p.minAmount))}`);
      result = {
        reply: `Here's the minimum investment for each package:\n\n${lines.join('\n')}\n\nTell me your budget and I'll suggest the best fit for you.`,
        quickReplies: ['Suggest a plan for my budget', 'Investment plans & rates'],
      };
    } else {
      const amount = parseAmount(msg);
      if (amount) {
        result = suggestForAmount(plans, amount);
      } else if (/plan|invest|rate|return|interest|yield|portfolio|option|package|tier|%/i.test(msg)) {
        result = listPlans(plans);
      } else if (/suggest|recommend|which.*(plan|invest)|best.*(plan|invest)/i.test(msg)) {
        result = {
          reply: "Sure! What's your budget? Tell me an amount (e.g. ₦100,000 or 2 million) and I'll suggest the best-fitting plan(s) and returns.",
        };
      } else {
        result = fallback();
      }
    }
  }

  res.json(result);
}
