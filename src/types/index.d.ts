declare global {
  namespace Express {
    interface Request {
      flash(type: string, message?: string | string[]): string[] | void;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userRole?: string;
    userEmail?: string;
    userName?: string;
    sessionVersion?: number;
    // Email captured at register/login so the "verify your email" notice and the
    // resend-verification form work without putting the address in the URL.
    pendingVerifyEmail?: string;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  kycStatus: string;
}
