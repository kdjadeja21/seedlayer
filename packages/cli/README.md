# seedlayer

Generate a Next.js app and the AI context layer from one config.

```bash
npx seedlayer my-app
npx seedlayer my-app --preset startup-speed --agents cursor,claude-code --no-credit
```

`--preset` selects a starting config (`startup-speed`, `team-strict`, or `hackathon-2h`). `--agents` chooses `cursor`, `claude-code`, or both. `--no-credit` omits the home page Seedlayer credit.

The generated repo works with Cursor, Claude Code, and other tools that read `AGENTS.md`.
