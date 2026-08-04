import type { AgentExecutionAttribution } from "./agent-execution-attribution.js";
import type { HookContext } from "./agent-tools.before-tool-call.types.js";

type ToolExecutionCorrelation = Readonly<{
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
}>;

const attributionByHookContext = new WeakMap<HookContext, AgentExecutionAttribution>();

/**
 * Bind admission attribution to a core-owned hook context without exposing a
 * forgeable property at the public SDK boundary.
 */
export function bindToolExecutionAttribution(
  ctx: HookContext,
  attribution: AgentExecutionAttribution | undefined,
): HookContext {
  if (attribution) {
    attributionByHookContext.set(ctx, attribution);
  }
  return ctx;
}

/** Preserve a private binding when a core owner must clone a hook context. */
export function inheritToolExecutionAttribution(
  source: HookContext | undefined,
  target: HookContext,
): HookContext {
  const attribution = source ? attributionByHookContext.get(source) : undefined;
  return bindToolExecutionAttribution(target, attribution);
}

/**
 * Bound admission attribution is authoritative when present. Flat fields
 * remain for public and legacy callers outside the admitted run lifecycle.
 */
export function resolveToolExecutionCorrelation(ctx?: HookContext): ToolExecutionCorrelation {
  const correlation = (ctx ? attributionByHookContext.get(ctx) : undefined) ?? ctx;
  return {
    ...(correlation?.agentId ? { agentId: correlation.agentId } : {}),
    ...(correlation?.sessionKey ? { sessionKey: correlation.sessionKey } : {}),
    ...(correlation?.sessionId ? { sessionId: correlation.sessionId } : {}),
    ...(correlation?.runId ? { runId: correlation.runId } : {}),
  };
}
