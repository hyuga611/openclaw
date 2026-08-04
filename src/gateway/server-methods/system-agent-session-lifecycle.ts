import { acknowledgeSystemAgentGreetingDelivery } from "../../system-agent/greeting.js";
import type { GatewayRequestContext } from "./types.js";

type SystemAgentSession =
  GatewayRequestContext["systemAgentSessions"] extends Map<string, infer Session> ? Session : never;

const MAX_SYSTEM_AGENT_SESSIONS = 8;

export function acknowledgeDeliveredSystemAgentWelcome(session: SystemAgentSession): void {
  const auditSequence = session.welcomeAuditSequence;
  if (auditSequence === undefined) {
    return;
  }
  acknowledgeSystemAgentGreetingDelivery({ auditSequence });
  delete session.welcomeAuditSequence;
}

export async function evictOldestSystemAgentSession(
  sessions: Map<string, SystemAgentSession>,
  context: GatewayRequestContext,
): Promise<void> {
  if (sessions.size < MAX_SYSTEM_AGENT_SESSIONS) {
    return;
  }
  let oldestKey: string | undefined;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [key, session] of sessions) {
    if (session.lastUsedAt < oldestAt) {
      oldestAt = session.lastUsedAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== undefined) {
    const oldest = sessions.get(oldestKey);
    if (oldest?.pendingApproval) {
      context.systemAgentApprovalManager?.expire(oldest.pendingApproval.id, "session-evicted");
    }
    await oldest?.engine.dispose();
    sessions.delete(oldestKey);
  }
}
