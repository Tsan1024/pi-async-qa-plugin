# Changelog

## [0.2.0] - 2026-11-04

- In Async mode, bypass ordinary input directly to question answering when the main agent is busy; idle input follows Pi normally.
- Remove model-based routing, automatic steering, clarification menus, dependent requests and topic/session selection from the question path.
- Use one read-only answer call with the main conversation snapshot, automatic result display and attributed feedback to the main agent.
- Remove the Ark-specific model adaptation. Retain progress, request deadlines and the main agent's existing background tools.

## [0.1.1] - 2026-11-04

- Keep automatic independent dispatch while the main agent is busy.
- Disable reasoning for routing and lightweight answers through Pi's simple API, including the Ark thinking protocol.
- Show each active request's stage, elapsed time and question above the editor.
- Bound routing model calls to 60 seconds and lightweight answers to 180 seconds; cancel and report failed requests without blocking subsequent routing.

## [0.1.0] - 2026-11-04

- Extract the async-mode extension into a standalone Pi package.
- Offer Default and Async through the `/mode` menu.
- Route independent questions, main-task corrections, dependent work and cancellation.
- Preserve topic-local history and reusable child sessions; feed attributed results back to the main agent.
