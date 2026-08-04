import { describe, expect, it, vi } from "vitest";
import { createDeferred } from "../shared/deferred.js";
import type { SettledBridgeRequest } from "./code-mode-runtime.js";
import { CodeModeBridgeDispatchQueue } from "./code-mode-state.js";
import {
  cloneCodeModeStats,
  CODE_MODE_BRIDGE_METHODS,
  createCodeModeStats,
} from "./code-mode-stats.js";

describe("Code Mode bridge accounting", () => {
  it("registers every guest bridge method at the host queue", async () => {
    const stats = createCodeModeStats();
    const queue = new CodeModeBridgeDispatchQueue(CODE_MODE_BRIDGE_METHODS.length, stats);

    await Promise.all(
      CODE_MODE_BRIDGE_METHODS.map(
        (method, index) =>
          queue.enqueue({
            id: `bridge-${index}`,
            method,
            start: async () => ({ id: `bridge-${index}`, ok: true, value: null }),
            cancelActive: vi.fn(),
          }).promise,
      ),
    );

    expect(cloneCodeModeStats(stats)).toEqual({
      controlCalls: {},
      bridgeCalls: Object.fromEntries(CODE_MODE_BRIDGE_METHODS.map((method) => [method, 1])),
      workerRuns: {},
      bridgeLifecycle: {
        registered: CODE_MODE_BRIDGE_METHODS.length,
        started: CODE_MODE_BRIDGE_METHODS.length,
        settled: CODE_MODE_BRIDGE_METHODS.length,
        unresolvedAtExtraction: 0,
      },
      outcomes: {},
    });
  });

  it("records a host failure without fabricating cancellation evidence", async () => {
    const stats = createCodeModeStats();
    const queue = new CodeModeBridgeDispatchQueue(1, stats);

    await queue.enqueue({
      id: "bridge-failed",
      method: "callValue",
      start: async () => ({ id: "bridge-failed", ok: false, error: "tool failed" }),
      cancelActive: vi.fn(),
    }).promise;

    expect(cloneCodeModeStats(stats).bridgeLifecycle).toEqual({
      registered: 1,
      started: 1,
      settled: 1,
      failed: 1,
      unresolvedAtExtraction: 0,
    });
  });

  it("keeps ignored-abort work unresolved until the active call actually settles", async () => {
    const stats = createCodeModeStats();
    const queue = new CodeModeBridgeDispatchQueue(1, stats);
    const activeCompletion = createDeferred<SettledBridgeRequest>();
    const cancelActive = vi.fn();
    const active = queue.enqueue({
      id: "bridge-active",
      method: "callValue",
      start: () => activeCompletion.promise,
      cancelActive,
    });
    const queuedStart = vi.fn(
      async (): Promise<SettledBridgeRequest> => ({
        id: "bridge-queued",
        ok: true,
        value: "unexpected",
      }),
    );
    const queued = queue.enqueue({
      id: "bridge-queued",
      method: "callValue",
      start: queuedStart,
      cancelActive: vi.fn(),
    });

    active.cancel();
    queued.cancel();
    await queued.promise;

    expect(cancelActive).toHaveBeenCalledOnce();
    expect(queuedStart).not.toHaveBeenCalled();
    expect(cloneCodeModeStats(stats).bridgeLifecycle).toEqual({
      registered: 2,
      started: 1,
      settled: 1,
      cancelRequested: 2,
      cancelledBeforeStart: 1,
      unresolvedAtExtraction: 1,
    });

    activeCompletion.resolve({ id: "bridge-active", ok: true, value: "late success" });
    await active.promise;

    expect(cloneCodeModeStats(stats).bridgeLifecycle).toEqual({
      registered: 2,
      started: 1,
      settled: 2,
      cancelRequested: 2,
      cancelledBeforeStart: 1,
      settledAfterCancel: 1,
      unresolvedAtExtraction: 0,
    });
  });
});
