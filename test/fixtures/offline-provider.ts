import { createAssistantMessageEventStream, Type } from "@earendil-works/pi-ai";

export default function (pi) {
  let release;
  let releaseSide;
  const stats = { sideCalls: 0 };
  pi.registerCommand("test-release", { description: "Release main test tool", handler: async () => release?.() });
  pi.registerCommand("test-release-side", { description: "Release slow side answer", handler: async () => releaseSide?.() });
  pi.registerCommand("test-stats", { description: "Read offline model call count", handler: async (_args, ctx) => ctx.ui.notify("OFFLINE_STATS:" + JSON.stringify(stats), "info") });
  pi.registerTool({ name: "test_hold", label: "test_hold", description: "Hold until released", parameters: Type.Object({}),
    execute: async () => {
      await new Promise((resolve) => { release = resolve; });
      return { content: [{ type: "text", text: "released" }], details: {} };
    },
  });
  pi.registerProvider("async-offline-test", {
    baseUrl: "https://invalid.local", api: "openai-completions", apiKey: "offline-test",
    models: [{ id: "test", name: "Offline test", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 4096 }],
    streamSimple(model, context) {
      const stream = createAssistantMessageEventStream();
      const textOf = (message) => typeof message.content === "string" ? message.content : (message.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
      const systemPrompt = context.systemPrompt ?? context.messages.filter((message) => message.role === "system").map(textOf).join("\n");
      const current = [...context.messages].reverse().find((message) => message.role === "user" && !textOf(message).startsWith("Current execution mode:") && !textOf(message).startsWith("Independent answers for the main-agent steward"));
      const input = current ? textOf(current) : "";
      let content;
      let stopReason = "stop";
      if (systemPrompt.startsWith("You are the independent conversation lane")) {
        stats.sideCalls++;
        if (context.messages.length !== 2 && context.messages.length !== 1) throw new Error("Unexpected side request transcript");
        if (context.messages.some((m) => m.role === "system" && m.tools?.length)) throw new Error("Side answer must be read-only");
        content = [{ type: "text", text: "OFFLINE_SIDE_ANSWER:" + input }];
      } else if (systemPrompt.startsWith("You are an input router")) {
        throw new Error("The model router must not run");
      } else if (!context.messages.slice(context.messages.indexOf(current) + 1).some((m) => m.role === "toolResult") && input === "Run main task") {
        stopReason = "toolUse";
        content = [{ type: "toolCall", id: "hold-" + Date.now(), name: "test_hold", arguments: {} }];
      } else if (input === "Idle question") {
        content = [{ type: "text", text: "OFFLINE_IDLE_MAIN" }];
      } else {
        const seenSideResults = context.messages.some((m) => textOf(m).includes("Independent answers for the main-agent steward"));
        content = [{ type: "text", text: seenSideResults ? "OFFLINE_MAIN_SAW_SIDE_RESULTS" : "OFFLINE_MAIN_DONE" }];
      }
      const output = { role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(), stopReason, content,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      const finish = () => { stream.push({ type: "start", partial: output }); stream.push({ type: "done", reason: stopReason, message: output }); stream.end(); };
      if (systemPrompt.startsWith("You are the independent conversation lane") && input === "Slow question") releaseSide = finish;
      else queueMicrotask(finish);
      return stream;
    },
  });
}
