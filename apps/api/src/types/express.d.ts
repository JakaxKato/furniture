import type { HydratedDocument } from 'mongoose';
import type { SessionDoc, UserDoc } from '../models';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        user: HydratedDocument<UserDoc>;
        session: HydratedDocument<SessionDoc>;
        csrfToken: string;
      };
    }
  }
}

export {};
