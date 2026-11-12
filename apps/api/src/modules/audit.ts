import type { ClientSession } from 'mongoose';
import { AuditLog } from '../models';

type AuditInput = {
  actorId?: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  correlationId?: string;
  summary: string;
  changes?: Record<string, unknown>;
  session?: ClientSession;
};

export async function writeAudit(input: AuditInput): Promise<void> {
  const doc = {
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    correlationId: input.correlationId,
    summary: input.summary,
    changes: input.changes,
  };
  if (input.session) {
    await AuditLog.create([doc], { session: input.session });
  } else {
    await AuditLog.create(doc);
  }
}
