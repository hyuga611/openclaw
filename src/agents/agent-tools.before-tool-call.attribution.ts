import type { HookContext } from "./agent-tools.before-tool-call.types.js";

type ToolExecutionCorrelation = Readonly<{
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
}>;

/**
 * Admission attribution is authoritative when present. Flat fields remain
 * only for legacy/internal callers that have not entered the run lifecycle.
 */
export function resolveToolExecutionCorrelation(ctx?: HookContext): ToolExecutionCorrelation {
  const correlation = ctx?.attribution ?? ctx;
  return {
    ...(correlation?.agentId ? { agentId: correlation.agentId } : {}),
    ...(correlation?.sessionKey ? { sessionKey: correlation.sessionKey } : {}),
    ...(correlation?.sessionId ? { sessionId: correlation.sessionId } : {}),
    ...(correlation?.runId ? { runId: correlation.runId } : {}),
  };
}
