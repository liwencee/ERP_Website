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
