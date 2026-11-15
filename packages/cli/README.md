# seedlayer

Generate a Next.js app and the AI context layer from one config.

```bash
npx seedlayer my-app
npx seedlayer my-app --preset startup-speed --agents cursor,claude-code --no-credit
```

`--preset` selects a starting config (`startup-speed`, `team-strict`, or `hackathon-2h`). `--agents` chooses `cursor`, `claude-code`, or both. `claude` is a short name for `claude-code`. `--version` and `-v` print the CLI version. `--no-credit` omits the home page Seedlayer credit.

On a terminal, the same choices are picked with the arrow keys and Enter. Agents is a multi-select: Space toggles, Enter confirms. `--yes` skips every question and the confirmation. `--interactive` and `--no-interactive` force questions on or off. `--use-npm`, `--use-pnpm`, `--use-yarn`, and `--use-bun` choose the package manager for install, verify, and the next-steps text. With none of those flags, seedlayer uses the package manager that launched it. `-i` / `--immediate` installs and then starts the dev server. Git is initialized with one commit, `Initial commit from seedlayer`, unless `--disable-git` is set. If git is missing or the commit fails, seedlayer warns and continues. The last answers are remembered in `~/.seedlayer.json`. `--reset-preferences` clears them.

The generated repo works with Cursor, Claude Code, and other tools that read `AGENTS.md`.
