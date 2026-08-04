import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendTranscriptTurn } from "../../system-agent/transcript-store.js";
import {
  captureSystemAgentWizardAction,
  persistSystemAgentEngineHistory,
} from "./system-agent-chat-history.js";

vi.mock("../../system-agent/transcript-store.js", () => ({
  appendTranscriptTurn: vi.fn(),
}));

describe("system-agent chat history presentation metadata", () => {
  beforeEach(() => {
    vi.mocked(appendTranscriptTurn).mockClear();
  });

  it("captures the sanitized server-owned step for a typed answer", () => {
    const step = {
      id: "slack-mode",
      type: "select" as const,
      message: "How should OpenClaw appear in Slack?",
      options: [{ label: "Slack bot", value: "bot" }],
    };

    expect(
      captureSystemAgentWizardAction(
        { getActiveWizardStep: () => step },
        { sessionId: "slack-session", wizardAnswer: { stepId: step.id, value: "bot" } },
      ),
    ).toEqual({ kind: "answer", step });
  });

  it("persists session scope and action metadata on the matching user turn", () => {
    const wizardAction = {
      kind: "cancel" as const,
      step: { id: "secret", type: "text" as const, message: "Twitch client secret" },
    };
    persistSystemAgentEngineHistory(
      {
        historySince: () => [
          { role: "user", text: "Cancel" },
          { role: "assistant", text: "Twitch setup cancelled." },
        ],
      },
      0,
      { sessionId: "twitch-session", wizardAction },
    );

    expect(vi.mocked(appendTranscriptTurn).mock.calls.map(([turn]) => turn)).toEqual([
      expect.objectContaining({
        role: "user",
        sessionId: "twitch-session",
        wizardAction,
      }),
      expect.objectContaining({
        role: "assistant",
        sessionId: "twitch-session",
      }),
    ]);
    expect(vi.mocked(appendTranscriptTurn).mock.calls[1]?.[0]).not.toHaveProperty("wizardAction");
  });
});
