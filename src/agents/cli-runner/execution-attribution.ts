import type { RunCliAgentParams } from "./types.js";

/** Projects admitted execution identity over legacy flat CLI-run fields. */
export function bindCliRunExecutionAttribution(params: RunCliAgentParams): RunCliAgentParams {
  const attribution = params.attribution;
  if (!attribution) {
    return params;
  }
  const {
    runId: _legacyRunId,
    lifecycleGeneration: _legacyLifecycleGeneration,
    sessionKey: _legacySessionKey,
    sessionId: _legacySessionId,
    agentId: _legacyAgentId,
    ...run
  } = params;
  return {
    ...run,
    runId: attribution.runId,
    lifecycleGeneration: attribution.lifecycleGeneration,
    sessionId: attribution.sessionId ?? _legacySessionId,
    ...(attribution.sessionKey ? { sessionKey: attribution.sessionKey } : {}),
    ...(attribution.agentId ? { agentId: attribution.agentId } : {}),
  };
}
