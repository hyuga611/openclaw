import type {
  SystemAgentChatHistoryResult,
  SystemAgentChatHistoryTurn,
} from "@openclaw/gateway-protocol";
import { html, nothing } from "lit";
import type { GatewayBrowserClient } from "../../api/gateway.ts";
import type { WizardStep } from "../../api/types.ts";
import { icons } from "../../components/icons.ts";
import { renderWizardStepControls } from "../../components/wizard-step-controls.ts";
import { t } from "../../i18n/index.ts";
import type { MessageGroup } from "../../lib/chat/chat-types.ts";
import { renderChatDivider } from "../chat/components/chat-divider.ts";
import { renderMarkdownText } from "../chat/components/chat-message-markdown.ts";
import { renderMessageGroup } from "../chat/components/chat-message.ts";
import { renderCustodianQuestionCard } from "./custodian-question-card.ts";
import type { CustodianStructuredQuestion } from "./structured-question.ts";

const CUSTODIAN_TRANSCRIPT_TIMEOUT_MS = 15_000;

export type CustodianMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  at: number;
  question: CustodianStructuredQuestion | null;
  step: WizardStep | null;
  structuredResponse: CustodianStructuredResponse | null;
  sessionId?: string;
};

export type CustodianStructuredResponse = {
  display: string;
  state: "submitting" | "submitted" | "uncertain";
};

export function hasUnresolvedCustodianQuestion(
  messages: readonly CustodianMessage[],
  dismissedQuestions: ReadonlySet<string>,
  answeredQuestions: ReadonlySet<string>,
  wizardInputPending: boolean,
  replyUncertain: boolean,
): boolean {
  return (
    wizardInputPending ||
    replyUncertain ||
    messages.some(
      (message) =>
        message.question !== null &&
        !dismissedQuestions.has(`${message.id}:${message.question.id}`) &&
        !answeredQuestions.has(`${message.id}:${message.question.id}`),
    )
  );
}

export function retireCustodianQuestions(
  messages: readonly CustodianMessage[],
  answeredQuestions: ReadonlySet<string>,
): Set<string> {
  const answered = new Set(answeredQuestions);
  for (const message of messages) {
    if (message.question) {
      answered.add(`${message.id}:${message.question.id}`);
    }
  }
  return answered;
}

export function createCustodianSessionId(): string {
  if (typeof crypto.randomUUID === "function") {
    return `control-ui-onboarding-${crypto.randomUUID()}`;
  }
  const suffix = [...crypto.getRandomValues(new Uint32Array(4))]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
  return `control-ui-onboarding-${suffix}`;
}

export function custodianErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : t("custodian.requestFailed");
}

function toCustodianMessageGroup(message: CustodianMessage): MessageGroup {
  const key = `msg-${message.id}`;
  return {
    kind: "group",
    key,
    role: message.role,
    messages: [{ message: { role: message.role, content: message.text }, key }],
    timestamp: message.at,
    isStreaming: false,
  };
}

export async function readCustodianTranscript(
  client: GatewayBrowserClient,
  sessionId?: string,
): Promise<{ ok: true; history: SystemAgentChatHistoryResult } | { ok: false; error: unknown }> {
  try {
    return {
      ok: true,
      history: await client.request<SystemAgentChatHistoryResult>(
        "openclaw.chat.history",
        sessionId ? { sessionId } : {},
        {
          timeoutMs: CUSTODIAN_TRANSCRIPT_TIMEOUT_MS,
        },
      ),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Sensitive turns are masked server-side before persistence: the engine pushes
 * only "<redacted secret>" into history (never raw input), so durable turns
 * cannot carry credentials. This mapping only localizes that marker to the
 * same display text live sensitive replies use.
 */
const SERVER_SENSITIVE_MASK = "<redacted secret>";

export function createCustodianTranscriptMessages(
  turns: readonly SystemAgentChatHistoryTurn[],
  firstMessageId: number,
  activeSession?: SystemAgentChatHistoryResult["session"],
): { messages: CustodianMessage[]; nextMessageId: number } {
  let nextMessageId = firstMessageId;
  const messages: CustodianMessage[] = [];
  for (const turn of turns) {
    const display =
      turn.role === "user" && turn.text === SERVER_SENSITIVE_MASK
        ? t("custodian.sensitiveReply")
        : turn.text;
    if (turn.role === "user" && turn.wizardAction) {
      const previous = messages.at(-1);
      const ownsPreviousPrompt =
        previous?.role === "assistant" &&
        turn.sessionId !== undefined &&
        previous.sessionId === turn.sessionId;
      const supportingText = ownsPreviousPrompt ? previous.text : "";
      if (supportingText) {
        messages.pop();
      }
      messages.push({
        id: nextMessageId++,
        role: "assistant",
        text: supportingText,
        at: turn.at,
        question: null,
        step: turn.wizardAction.step,
        structuredResponse: { display, state: "submitted" },
        ...(turn.sessionId ? { sessionId: turn.sessionId } : {}),
      });
      continue;
    }
    messages.push({
      id: nextMessageId++,
      role: turn.role,
      text: display,
      at: turn.at,
      question: null,
      step: null,
      structuredResponse: null,
      ...(turn.sessionId ? { sessionId: turn.sessionId } : {}),
    });
  }
  if (activeSession?.step) {
    const activePrompt = messages.findLast(
      (message) =>
        message.role === "assistant" &&
        message.sessionId === activeSession.sessionId &&
        message.structuredResponse === null,
    );
    if (activePrompt) {
      activePrompt.step = activeSession.step;
    } else {
      messages.push({
        id: nextMessageId++,
        role: "assistant",
        text: "",
        at: Date.now(),
        question: null,
        step: activeSession.step,
        structuredResponse: null,
        sessionId: activeSession.sessionId,
      });
    }
  }
  return { messages, nextMessageId };
}

function renderCustodianEarlierDivider(message: CustodianMessage, boundaryAfterId: number | null) {
  return message.id === boundaryAfterId
    ? renderChatDivider({
        kind: "divider",
        key: "custodian-earlier",
        label: t("custodian.earlier"),
        timestamp: message.at,
      })
    : nothing;
}

function hasWizardSupportingInstructions(message: CustodianMessage): boolean {
  const text = message.text.trim();
  return text.length > 240 || text.split("\n").length >= 4;
}

function renderWizardDetails(message: CustodianMessage) {
  return hasWizardSupportingInstructions(message)
    ? html`<details class="custodian__wizard-details">
        <summary>${t("custodian.structured.setupInstructions")}</summary>
        <div class="custodian__wizard-details-content">
          ${renderMarkdownText(message.text, false)}
        </div>
      </details>`
    : nothing;
}

function structuredPrompt(message: CustodianMessage): string {
  return (
    message.step?.title ??
    message.step?.message ??
    message.question?.question ??
    t("custodian.structured.response")
  );
}

function renderStructuredResponse(message: CustodianMessage) {
  const response = message.structuredResponse;
  if (!response) {
    return nothing;
  }
  const status =
    response.state === "submitting"
      ? t("custodian.structured.submitting")
      : response.state === "uncertain"
        ? t("custodian.structured.confirmationUnavailable")
        : t("custodian.structured.submitted");
  return html`<section
    class="custodian__structured-response"
    aria-label=${t("custodian.structured.response")}
    aria-busy=${response.state === "submitting" ? "true" : "false"}
  >
    <span class="custodian__structured-response-icon" aria-hidden="true">${icons.check}</span>
    <span class="custodian__structured-response-copy">
      <span class="custodian__structured-response-prompt">${structuredPrompt(message)}</span>
      <strong>${response.display}</strong>
      <span class="sr-only">${status}</span>
    </span>
    ${message.step ? renderWizardDetails(message) : nothing}
  </section>`;
}

export function renderCustodianTranscriptEntry(params: {
  message: CustodianMessage;
  boundaryAfterId: number | null;
  assistantAvatar: string;
  showQuestion: boolean;
  questionDisabled: boolean;
  showWizardStep: boolean;
  wizardValue: unknown;
  wizardDisabled: boolean;
  wizardSecretVisible: boolean;
  onSelect: (label: string) => void;
  onSkip: () => void;
  onWizardValueChange: (value: unknown) => void;
  onWizardAnswer: (value: unknown) => void;
  onWizardCancel: () => void;
  onToggleWizardSecretVisibility: () => void;
}) {
  const question = params.message.question;
  const step = params.message.step;
  const hasStructuredResponse = params.message.structuredResponse !== null;
  const hasActiveQuestion = params.showQuestion && question !== null;
  const hasActiveWizardStep = params.showWizardStep && step !== null;
  const showTranscriptMessage =
    params.message.text && !hasActiveQuestion && !hasActiveWizardStep && !hasStructuredResponse;
  return html`
    ${showTranscriptMessage
      ? renderMessageGroup(toCustodianMessageGroup(params.message), {
          showReasoning: false,
          showToolCalls: false,
          assistantName: t("custodian.title"),
          assistantAvatar: params.assistantAvatar,
        })
      : nothing}
    ${renderCustodianEarlierDivider(params.message, params.boundaryAfterId)}
    ${hasStructuredResponse
      ? renderStructuredResponse(params.message)
      : params.showQuestion && question
        ? renderCustodianQuestionCard({
            question,
            disabled: params.questionDisabled,
            onSelect: params.onSelect,
            onSkip: params.onSkip,
          })
        : nothing}
    ${hasActiveWizardStep && !hasStructuredResponse
      ? html`<section
          class="custodian__wizard-step"
          aria-label=${step.title ?? step.message ?? "Setup"}
        >
          ${step.title
            ? html`<strong class="custodian__wizard-title">${step.title}</strong>`
            : nothing}
          ${renderWizardDetails(params.message)}
          ${renderWizardStepControls({
            step,
            value: params.wizardValue,
            busy: params.wizardDisabled,
            inputId: `custodian-wizard-input-${params.message.id}`,
            sensitiveRevealed: params.wizardSecretVisible,
            onValueChange: params.onWizardValueChange,
            onAnswer: params.onWizardAnswer,
            onToggleSensitiveVisibility: params.onToggleWizardSecretVisibility,
          })}
          <div class="custodian__wizard-footer">
            <button
              class="btn danger custodian__wizard-cancel"
              type="button"
              ?disabled=${params.wizardDisabled}
              @click=${params.onWizardCancel}
            >
              ${t("common.cancel")}
            </button>
          </div>
        </section>`
      : nothing}
  `;
}
