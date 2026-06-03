# opencode-evolve

Manual skill evolution for OpenCode.

`opencode-evolve` gives OpenCode a controlled way to turn your corrections, project workflows, and hard-won debugging lessons into reusable local skills.

It is inspired by Hermes Agent's skill evolution loop, but intentionally **manual**.

Hermes-style self-improvement is powerful, but automatic skill writing can happen at the wrong time, miss the point, or preserve a lesson incorrectly. `opencode-evolve` takes the useful part — creating and refining skills from real work — and puts you back in control.

You decide when the agent should evolve.

```txt
/evolve remember: this repo uses bun test, not npm test
```

The plugin gives the agent safe tools to list, read, patch, create, and lock skills in your project.

---

## The problem

AI coding agents are good at solving the current task.

They are much worse at carrying project-specific lessons into the next session.

You correct the agent once:

```txt
Don't edit generated files.
Use bun test here.
Check staged and unstaged diffs separately.
Run Firebase emulators before testing functions.
This repo uses feature flags through config.ts, not env vars.
```

Then a week later, the agent forgets.

So you explain it again.

That is the pain `opencode-evolve` solves.

Not by adding a giant memory database.
Not by running an autonomous background curator.
Not by turning every chat message into knowledge.

It gives you a small, explicit loop:

```txt
correction -> /evolve -> SKILL.md -> better future sessions
```

---

## Why manual?

Because not every lesson should become a skill.

Automatic self-improvement sounds nice until the agent confidently writes the wrong thing into long-term instructions.

`opencode-evolve` is manual on purpose:

* You call `/evolve` when a lesson is actually worth keeping.
* You can point the agent at the exact workflow to capture.
* The agent gets dedicated tools for safe skill edits.
* The result is plain files you can review with Git.
* If the change is bad, you revert it like any other code change.

This keeps the loop useful without making it spooky.

---

## What it does

`opencode-evolve` manages project-local skills in:

```txt
.opencode/skills/
```

It can:

* list existing skills
* read `SKILL.md` and supporting files
* create new skills
* patch skills with exact text replacement
* add supporting files under safe directories
* remove supporting files safely
* lock skills that should not be edited
* reject unsafe paths, oversized files, and likely secrets

It is designed for reusable project workflows, not random notes.

Good candidates:

```txt
Use this test command in this repo.
Never edit these generated files.
Follow this release checklist.
Debug this service in this order.
Use this git review workflow.
Use this project-specific architecture pattern.
```

Bad candidates:

```txt
I fixed one typo.
The package manager was temporarily broken.
The API was down today.
The agent made a random one-off mistake.
```

---

## What this is not

`opencode-evolve` is not a skill marketplace.

It is not a replacement for OpenCode's built-in skills.

It is not a background memory system.

It is not an autonomous self-improving agent.

It is a small plugin that gives your agent a safe way to maintain project skills when you explicitly ask it to.

---

## Quick example

The agent keeps running the wrong command:

```txt
npm test
```

But your repo uses:

```txt
bun test
```

You run:

```txt
/evolve remember: this project uses bun test, not npm test
```

The agent can create or patch a skill like:

```txt
.opencode/skills/project-test-workflow/SKILL.md
```

Next time, the workflow is available as project knowledge instead of buried in an old chat.

Review the change:

```bash
git diff .opencode/skills
```

Commit it if it is useful.

---

## Installation

Add the plugin to your OpenCode config.

Project config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-evolve"]
}
```

Then add the command template:

```txt
templates/evolve.md -> .opencode/commands/evolve.md
```

Restart OpenCode.

Now use:

```txt
/evolve
```

or:

```txt
/evolve remember: always check staged and unstaged diffs separately before editing git changes
```

---

## Recommended setup

Commit these files to your repo:

```txt
.opencode/commands/evolve.md
.opencode/skills/
```

This makes your agent's project knowledge travel with the codebase.

Do not commit local debug files or temporary experiments.

---

## How it works

The `/evolve` command tells the agent when to update skills.

The plugin gives the agent four tools:

| Tool            | Purpose                                   |
| --------------- | ----------------------------------------- |
| `evolve_list`   | List project skills and their status      |
| `evolve_read`   | Read a skill or supporting file           |
| `evolve_edit`   | Create, patch, or edit skill files safely |
| `evolve_curate` | Lock, unlock, or inspect skill governance |

The agent does not need shell tricks or broad filesystem access to maintain skills. It uses these scoped tools.

---

## Skill storage

Skills live in:

```txt
.opencode/skills/
```

Examples:

```txt
.opencode/skills/git-review-flow/SKILL.md
.opencode/skills/testing/bun-workflow/SKILL.md
.opencode/skills/firebase/emulator-debugging/SKILL.md
```

A skill may also include supporting files:

```txt
references/
templates/
scripts/
assets/
```

Example:

```txt
.opencode/skills/release-checklist/
  SKILL.md
  references/
    manual-release-notes.md
  scripts/
    verify-release.sh
```

---

## Editing model

`opencode-evolve` supports two main ways to change a skill.

### Patch

Use `patch` for small, surgical edits.

It replaces one exact piece of text with another.

This is the preferred path for most changes because it reduces accidental rewrites.

### Update

Use `update` only when the skill needs a full rewrite.

It replaces the whole `SKILL.md`.

That is useful for major cleanup, but it should not be the default.

---

## Safety model

The plugin is intentionally conservative.

It protects against:

* path traversal
* symlink escapes
* editing locked skills
* deleting protected files
* writing outside allowed support directories
* oversized support files
* likely secrets in skill content

Skills can be locked with `.evolve.json`.

Locked skills remain readable, but cannot be modified until unlocked.

---

## Example `/evolve` prompts

```txt
/evolve remember: never mix already staged user-approved changes with new unstaged edits
```

```txt
/evolve create a skill for our Firebase emulator workflow
```

```txt
/evolve improve the git-review-flow skill with the staged/unstaged rule we just used
```

```txt
/evolve lock git-review-flow
```

```txt
/evolve status
```

---

## Philosophy

The best agent memory is not a giant transcript.

It is a small set of reusable procedures that are close to the project and easy to review.

`opencode-evolve` keeps the loop simple:

```txt
You notice the lesson.
You call /evolve.
The agent updates a skill.
Git shows the diff.
Future sessions benefit.
```

No hidden database.
No automatic background rewriting.
No telemetry.
No magic.

Just project-local skills.

---

## Development

This repo includes a playground for fast local plugin development.

The playground plugin imports the source directly:

```ts
export { EvolvePlugin, default } from "../../../src/plugin"
```

Run:

```bash
npm install
npm run dev
```

After changing plugin code, restart OpenCode.

Run tests:

```bash
npm test
npm run typecheck
npm run build
```

Check the npm package contents:

```bash
npm run pack:check
```

---

## Status

Early project.

The goal is to stay small:

* one command
* four tools
* project-local skills
* Git-reviewable changes

If a feature makes the workflow feel like a dashboard, database, or framework, it probably does not belong here.

---

## License

MIT
