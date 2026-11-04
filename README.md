# Pi Async Q&A Plugin

A plugin for [Pi](https://github.com/earendil-works/pi) that answers questions alongside a busy main agent. Turn on **Async**, keep the main task running, and ask another question without waiting for it to finish. When the main agent is idle, input follows Pi normally.

The package name is `pi-async-qa-plugin`: a Pi plugin for asynchronous question answering. It installs through Pi's native package system and requires no changes to Pi itself.

## Requirements

- Pi 1.5.0, the currently validated host version. Other versions are not guaranteed.
- Node.js 22.19 or newer.
- A configured Pi model. Each side question uses one answer call to the selected model.

Pi supplies the extension APIs and TypeBox at runtime. Users do not need the Pi source repository, a build step, or `npm install` inside this package.

## Install

Install directly from GitHub:

```sh
pi install git:github.com/Tsan1024/pi-async-qa-plugin
```

Finish active work and reopen Pi or use `/reload`.

For local development, clone into a permanent directory and install that path:

```sh
git clone https://github.com/Tsan1024/pi-async-qa-plugin.git
pi install ./pi-async-qa-plugin
```

Local installations refer to the directory in place, so keep it after installation. An existing checkout named `pi-async-mode` can keep its directory name; install its absolute path.

If an earlier copy is installed at `~/.pi/agent/extensions/async-mode`, move that directory outside `extensions` before reloading. Loading both copies registers duplicate commands and tools.

Use a single installation source. If this plugin is already installed from a local path, remove that source before switching to GitHub. This package is not published to npm.

## Use

Enter `/mode`, press Enter, choose **Async**, and type normally. Choose **Default** in the same menu to return to Pi's usual behavior. The choice belongs to the current session; new sessions start in Default.

The rule is simple:

- **Busy main agent:** ordinary input goes directly to a separate, read-only answer call.
- **Idle main agent:** input follows Pi's normal main conversation, even after earlier side questions.
- **Default mode:** Pi keeps its normal input behavior.

For example, let the main agent work on a refactor. While it runs, ask “What does this function do?” or “What are the tradeoffs of parallel execution?” The answer appears separately, and the refactor continues. The side answer uses available conversation context; it does not run a fresh inspection.

There is no model call to decide where input belongs. Busy input is not automatically steered, scheduled, or assigned a new session. Slash commands and Pi's explicit follow-up delivery keep their native behavior. There are no additional public commands to learn. UI messages use English; answers follow the user's language.

Each side answer receives the question and a snapshot of the main conversation at submission time. It cannot inspect files, run tools or change the main task. Answers appear automatically. A slow answer does not block another side question. Active requests show their ID, stage, elapsed time and question above the editor.

The selected model is passed to Pi unchanged, without provider-specific adaptation. Model calls may still be slow. Each side call times out after 180 seconds and releases its slot if it fails. The main task continues independently.

The main agent receives attributed result records at its next model call. This does not interrupt its current call or copy all child history into its context.

## Limits

Side questions are separate read-only requests; they do not create child sessions or automatically combine their histories. The main agent's existing background delegation tools remain available for its own complex work. Reloading or exiting stops accepted side requests and workers; interrupted work is not replayed automatically.

Read [behavior and limits](docs/behavior.md) for context snapshots, result feedback and request lifetime.

## Remove

```sh
pi remove git:github.com/Tsan1024/pi-async-qa-plugin
```

For a local installation, pass the installed directory path to `pi remove` instead. Reload Pi after current work finishes. Removing the package does not undo worker file changes or delete saved task histories.

## Develop and verify

```sh
npm ci --ignore-scripts
npm run check
npm run test
npm run test:smoke
npm pack --ignore-scripts
```

The smoke check requires Python 3 and `pi` on PATH (or `PI_BIN` pointing to Pi). It installs the package into a temporary Pi configuration and uses a local fake provider. It verifies one model call per busy question, concurrent answers, progress, result feedback, normal idle handling and Default-mode steering. It does not use real model APIs or modify personal Pi settings.

The npm archive contains only runtime sources, documentation, the manifest and license. Development tests stay in the Git repository/source archive.

## Origin

Extracted from the async-mode implementation in [Tsan1024/pi](https://github.com/Tsan1024/pi), commit `e8c2271`. This package keeps the MIT license from that source and does not require changes to Pi itself.
