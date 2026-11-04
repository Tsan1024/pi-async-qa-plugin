# Behavior and limits

In Async mode, ordinary input uses one rule: if the main agent is busy (`ctx.isIdle()` is false), answer separately; otherwise let Pi handle the input normally. Default mode keeps Pi's normal behavior. Extension messages, slash commands and explicit follow-up delivery keep their native paths.

The question path makes one read-only answer call. It does not classify intention, choose topics, open child sessions, run tools, schedule dependencies or automatically change the main task. The answer receives the question and attachments plus a bounded snapshot of recent main conversation text and any partially streamed main answer. Other side questions are not copied into that request.

Each answer records its original question, request/session IDs, start and finish times, state and result. Answers appear immediately through Pi UI notifications. Active questions show stage and elapsed time above the editor. Up to four questions may run concurrently; a slow answer does not serialize later answers. Additional questions are returned to the editor for retry.

The main agent receives the last eight attributed result records at its next model call, with an explicit indication that they have already been displayed. It can read complete records with the model-only `async_dialogue_read` tool. Results are reference data, not new instructions to execute an action. Returning a side answer does not force a new main-agent turn.

The selected model and authentication come from Pi's model registry. There is no provider-specific adapter or separate routing model. The simple API requests its normal reasoning-off behavior, which depends on the host provider's support. Calls may still be slow. Each side answer has a 180-second deadline; a timeout reports failure and releases its slot. Main-agent work is unaffected.

Selecting Default does not cancel an already accepted answer. Reloading, switching sessions or exiting aborts session-owned requests. Unfinished historical requests are cancelled on restore, including old routing/dependency records, and are not automatically replayed. Saved histories remain in the parent session.

The main agent's existing `async_start`, `async_status` and `async_cancel` tools remain available for its own complex background work. Those workers may use tools and share files; they are separate from read-only side questions.
