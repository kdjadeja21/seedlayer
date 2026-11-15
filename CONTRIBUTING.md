# Contributing

Seedlayer is a config, a catalog of packs, and a renderer. The web form and the CLI both call that renderer.

## Setup

Node.js 20 or newer. This repo uses pnpm 10.12.1 (`packageManager` in the root `package.json`).

```bash
pnpm install
```

## Scripts

| Script                  | What it does                                                               |
| ----------------------- | -------------------------------------------------------------------------- |
| `pnpm lint`             | Biome check                                                                |
| `pnpm typecheck`        | Build the packages, then typecheck the web app                             |
| `pnpm build`            | Build every workspace package                                              |
| `pnpm test`             | Build the packages, then run their tests                                   |
| `pnpm dev`              | Build core and packs, then start the configurator at http://localhost:3000 |
| `pnpm verify:generated` | Render each preset and run install, lint, typecheck, test, and build       |
| `pnpm release:dry`      | Run the release checks and a dry-run publish                               |

Before pushing, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` must pass.

## Branching

Follow [docs/BRANCHING.md](docs/BRANCHING.md). `main` is the only long-lived branch and stays releasable. Branch from the latest `main` as `<type>/<short-kebab-description>`, open a pull request into `main`, and squash-merge.

Sync with `origin` and the latest `origin/main` before editing. There must be zero commits on `origin/main` missing from your branch before you edit files. Cursor, Claude, and other agents follow the same rules (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/branching.mdc`).

## Tests

```bash
pnpm test
```

That builds `packages/*` and runs each package test suite. `pnpm verify:generated` renders each preset and runs install, lint, typecheck, test, and build in the generated app. Set `PRESET=startup-speed` to run one.

Do not put a timestamp in rendered output. The same config must produce the same files.

## Add a pack

1. Create `packages/packs/content/<name>/pack.json`.
2. Validate it with the manifest schema: `name`, `version`, `requires`, `conflicts`, `options`, `outputs`, `agentRules`.
3. Put `.hbs` templates next to the manifest. Use `{{config...}}`, `{{tokens...}}`, and `{{flags...}}`. Escaping is off, and a missing variable fails the build.
4. For JSON or TypeScript that a template would mangle, add a builder in `packages/packs/src/builders` and point the output at `"template": "@build"`.
5. Conditional files set `when`. Combine checks with `+`, for example `agent:cursor+workflow:plan`.
6. Rules live in `rules/<id>.md` with `title`, `description`, and `alwaysApply` frontmatter. The renderer writes `docs/agents/<id>.md` and, for Cursor, `.cursor/rules/<id>.mdc`.
7. Teach `selectPackNames` when the pack should be included.
8. Add a test that a preset renders the new file and that two conflicting packs fail.

Keep `AGENTS.md` under 80 lines. The renderer throws if it grows past that.

## Add a preset

Add `packages/packs/presets/<id>.json`. It must parse as a full config, and its `preset` field must be the file's id. Cover it in `packages/packs/test/render.test.ts`.

Presets that ship: `startup-speed`, `team-strict`, `hackathon-2h`.

## Repository

```text
packages/core     Zod schema, config codes, pack resolver, template renderer
packages/packs    Pack content and the three presets
packages/cli      seedlayer
apps/web          Configurator
```
