# Seedlayer

Configure a project in the web UI, run one command, and get a repo with the app scaffold and the AI context layer already wired up.

```bash
npx seedlayer my-app --preset startup-speed
npx seedlayer my-app --preset startup-speed --palette harbor --agents cursor,claude-code
```

The same config always produces the same files. The web UI and the CLI share `@seedlayer/core`, so they cannot disagree.

## Flags

`--preset` defaults to `startup-speed`. The other flags override that preset. Pass only the ones you want to change.

| Flag                                                 | Values                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `--preset`                                           | `startup-speed`, `team-strict`, `hackathon-2h`                                       |
| `--palette`                                          | `ink`, `harbor`, `ember`, `iris`, `grove`, `dusk`                                    |
| `--font`                                             | `Inter`, `Geist`, `system`                                                           |
| `--ui`                                               | `shadcn`, `none`                                                                     |
| `--radius`                                           | `none`, `sm`, `md`, `lg`                                                             |
| `--density`                                          | `compact`, `comfortable`, `spacious`                                                 |
| `--agents`                                           | comma-separated `cursor`, `claude-code` (`claude` is a short name for `claude-code`) |
| `--lint`                                             | `biome`, `eslint`                                                                    |
| `--branching`                                        | `trunk`, `github-flow`, `agent-safe`                                                 |
| `--no-credit`                                        | omit the home page Seedlayer credit                                                  |
| `--use-npm`, `--use-pnpm`, `--use-yarn`, `--use-bun` | package manager for install, verify, and next steps                                  |
| `--disable-git`                                      | skip `git init` and the first commit                                                 |
| `--yes`                                              | skip the questions and use the preset defaults plus any flags                        |
| `--interactive`, `--no-interactive`                  | force the questions on or off                                                        |
| `-i`, `--immediate`                                  | install, then start the dev server                                                   |
| `--reset-preferences`                                | forget the answers saved in `~/.seedlayer.json`                                      |
| `--version`, `-v`                                    | print the CLI version                                                                |
| `--config`                                           | an `sl1.` code or a JSON file                                                        |

`--config` cannot be combined with the config flags above. With no config flags, an interactive terminal picks the preset, palette, agents, font, UI components, radius, density, lint, branching, credit, package manager, git, and whether to start the dev server, then confirms before writing. Arrow keys move, Enter selects, and Space toggles agents. `--yes` skips the questions. A non-interactive shell uses `startup-speed`. The package manager defaults to the one that launched the CLI. Git is initialized and the first commit is `Initial commit from seedlayer` unless `--disable-git` is set. The last interactive answers are saved in `~/.seedlayer.json` and offered next time.

This branch is a cursor-lab experiment. `main` stays the starter. The name, license, and scope notes are in [docs/decisions.md](docs/decisions.md). Branch, commit, and release rules are in [docs/BRANCHING.md](docs/BRANCHING.md).

## What you get

| Pack           | Output                                                            |
| -------------- | ----------------------------------------------------------------- |
| stack-nextjs   | Next.js, Tailwind, shadcn or none, Vitest                         |
| design-system  | `app/tokens.css`, `DESIGN.md`                                     |
| code-standards | Biome or ESLint, `CODE_STYLE.md`, file-size check                 |
| branching      | Trunk, GitHub Flow, or agent-safe, plus a pull request template   |
| agents-core    | Short `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`                   |
| workflow       | `/plan`, `/implement`, `/review`, skills, hooks, empty MCP config |
| quality-gates  | Husky, commitlint, GitHub Actions                                 |

`AGENTS.md` is an index. Detail lives in the linked docs. The renderer rejects an `AGENTS.md` over 80 lines.

## Presets

- `startup-speed` — agent-safe branches, Biome, Cursor and Claude Code, the full quality gates
- `team-strict` — GitHub Flow, ESLint, PascalCase components, `Result` errors, 200-line files
- `hackathon-2h` — trunk-based, grove palette, Cursor only, CI without Husky

## Develop

```bash
pnpm install
pnpm test
pnpm dev
```

Open the configurator at http://localhost:3000. Copy the command, copy the shareable link, or download a zip of the rendered files. The zip does not install dependencies. The CLI does, then runs lint and typecheck.

```bash
node packages/cli/dist/bin.js my-app --preset team-strict --lint biome --radius lg
node packages/cli/dist/bin.js my-app --config sl1....
node packages/cli/dist/bin.js my-app --config ./config.json
```

`pnpm verify:generated` renders each preset and runs install, lint, typecheck, test, and build.

## Layout

```text
packages/core     schema, config codes, resolver, renderer
packages/packs    packs and presets
packages/cli      seedlayer
apps/web          configurator
```

A config code is `sl1.` plus URL-safe deflate of the canonical JSON. No backend.

`.seedlayer/lock.json` in a generated repo records the config and pack versions.

## Documentation

| Topic                       | Doc                                    |
| --------------------------- | -------------------------------------- |
| Branches, commits, releases | [docs/BRANCHING.md](docs/BRANCHING.md) |
| Name, license, and scope    | [docs/decisions.md](docs/decisions.md) |

## License

MIT. See [LICENSE](LICENSE).
