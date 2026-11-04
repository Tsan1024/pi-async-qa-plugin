import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { type TaskRecord, TaskRuntime } from "../src/runtime.ts";

const request = {
  id: "question-1",
  sessionId: "session-1",
  text: "Investigate and implement the migration",
  createdAt: "2026-11-04T00:00:00.000Z",
};
const input = {
  request,
  description: "Inspect migration compatibility",
  context: "Use staging fixtures",
  reason: "Multi-module analysis and slow validation",
};

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Timed out waiting for task completion");
    await setTimeout(10);
  }
}

test("returns before completion and preserves the originating request", async () => {
  let complete!: (result: { success: boolean; result: string }) => void;
  const persisted: TaskRecord[] = [];
  const notify = mock.fn();
  const runtime = new TaskRuntime((record) => persisted.push(structuredClone(record)), notify);
  try {
    const original = { ...request };
    const record = runtime.start(
      { ...input, request: original },
      async () => new Promise((resolve) => { complete = resolve; }),
    );
    assert.equal(record.execution.state.status, "running");
    original.text = "Another question";
    await Promise.resolve();
    complete({ success: true, result: "Migration verified" });
    await waitFor(() => notify.mock.callCount() === 1);
    assert.equal(persisted[0].execution.state.status, "running");
    const event = runtime.events()[0];
    assert.deepEqual(event.request, request);
    assert.equal(event.result, "Migration verified");
    assert.equal(event.taskId, record.task.id);
    assert.equal(event.status, "completed");
    assert.ok(event.finishedAt);
  } finally {
    await runtime.close();
  }
});

test("records failures and cancels workers independently of foreground turns", async () => {
  const runtime = new TaskRuntime(() => {}, () => {});
  try {
    const failed = runtime.start(input, async () => { throw new Error("worker failure"); });
    const cancelled = runtime.start(input, async (_task, signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ success: false, result: "stopped" }), { once: true });
    }));
    await Promise.resolve();
    runtime.cancel(cancelled.task.id);
    await waitFor(() => runtime.events().length === 2);
    assert.equal(failed.execution.state.status, "failed");
    assert.match(JSON.stringify(failed.execution.state), /worker failure/);
    assert.equal(cancelled.execution.state.status, "cancelled");
  } finally {
    await runtime.close();
  }
});

test("does not replay abandoned work and suppresses notifications after close", async () => {
  const records: TaskRecord[] = [];
  const notify = mock.fn();
  const runtime = new TaskRuntime((record) => records.push(structuredClone(record)), notify);
  runtime.start(input, async () => ({ success: true, result: "should not launch after close" }));
  await runtime.close();
  assert.equal(notify.mock.callCount(), 0);
  assert.equal(runtime.events()[0].status, "cancelled");
  const restored = new TaskRuntime(() => {}, () => {});
  try {
    restored.restore(records[0]);
    restored.recover();
    assert.equal(restored.events()[0].status, "interrupted");
    assert.equal(restored.events()[0].id, runtime.events()[0].id);
  } finally {
    await restored.close();
  }
});
