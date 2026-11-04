import assert from "node:assert/strict";
import { test } from "node:test";
import { runProcess } from "../src/executor.ts";

test("ignores malformed output and returns validated assistant text", async () => {
  const script = 'console.log("noise"); console.log(JSON.stringify({type:"message_end",message:{role:"assistant",content:[{type:"text",text:"done"}],stopReason:"stop"}}))';
  assert.deepEqual(
    await runProcess(process.execPath, ["-e", script], process.cwd(), new AbortController().signal),
    { success: true, result: "done" },
  );
});

test("surfaces launch failure and cancellation without hanging", async () => {
  const failed = await runProcess("/nonexistent/pi-async-executor", [], process.cwd(), new AbortController().signal);
  assert.equal(failed.success, false);
  const controller = new AbortController();
  const result = runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], process.cwd(), controller.signal);
  controller.abort();
  assert.deepEqual(await result, { success: false, result: "Background execution cancelled." });
});
