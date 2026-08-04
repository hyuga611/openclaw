import type {
  SystemAgentChatHistoryWizardAction,
  SystemAgentChatParams,
} from "../../../packages/gateway-protocol/src/index.js";
import type { SystemAgentChatEngine } from "../../system-agent/chat-engine.js";
import { appendTranscriptTurn } from "../../system-agent/transcript-store.js";

export function captureSystemAgentWizardAction(
  engine: Pick<SystemAgentChatEngine, "getActiveWizardStep">,
  input: SystemAgentChatParams,
): SystemAgentChatHistoryWizardAction | undefined {
  const kind = input.wizardAnswer ? "answer" : input.wizardCancel ? "cancel" : undefined;
  const stepId = input.wizardAnswer?.stepId ?? input.wizardCancel?.stepId;
  if (!kind || !stepId) {
    return undefined;
  }
  const step = engine.getActiveWizardStep();
  return step?.id === stepId ? { kind, step } : undefined;
}

export function persistSystemAgentEngineHistory(
  engine: Pick<SystemAgentChatEngine, "historySince">,
  startIndex: number,
  params: {
    sessionId: string;
    wizardAction?: SystemAgentChatHistoryWizardAction;
  },
): void {
  const at = Date.now();
  let { wizardAction } = params;
  for (const turn of engine.historySince(startIndex)) {
    // Engine history is authoritative here: sensitive user text has already
    // been replaced by the mask marker before it crosses this boundary.
    const action = turn.role === "user" ? wizardAction : undefined;
    appendTranscriptTurn({
      ...turn,
      at,
      sessionId: params.sessionId,
      ...(action ? { wizardAction: action } : {}),
    });
    if (action) {
      wizardAction = undefined;
    }
  }
}
