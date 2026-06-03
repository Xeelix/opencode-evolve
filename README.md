# opencode-evolve

Safe local skill management plugin for OpenCode.

## Design

- Skills live only in `.opencode/skills`.
- Nested skills are supported: `caps/frames`, `frontend/forms`.
- The tool API uses one stable identifier: `skill`.
- Full rewrites go through strict `patch`; there is no unsafe `update` action.
- Supporting files are limited to `references/`, `templates/`, `scripts/`, and `assets/`.

## Development

```bash
npm install
npm run dev
```

The playground plugin imports source directly:

```ts
export { EvolvePlugin, default } from "../../../src/plugin"
```

Restart OpenCode after changing plugin code.

## Tests

```bash
npm test
npm run typecheck
```

## Package Check

```bash
npm run build
npm run pack:check
```
