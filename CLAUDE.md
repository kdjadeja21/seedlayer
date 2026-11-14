# Claude Code

Follow [AGENTS.md](AGENTS.md) and [docs/BRANCHING.md](docs/BRANCHING.md). The branching and sync rules below are the same ones Cursor loads from `.cursor/rules/`.

@AGENTS.md

## Sync before editing

1. `git fetch origin`
2. Pull the branch you are on (`git pull origin <current-branch>`).
3. If the branch is not `main`, integrate the latest `origin/main`. There must be zero commits on `origin/main` missing from your branch before you edit files.
4. Resolve merge conflicts before editing.

If the branch has no remote yet, branch from the latest `origin/main`, not a stale local `main`.

## Branching

- Branch from the latest `main`. Never commit directly to `main`.
- Branch names: `<type>/<short-kebab-description>`. Type is one of `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `hotfix` (for example `feat/cli-flags`).
- Never add tool, agent, or author prefixes or suffixes to branch names (no `cursor/`, no random IDs). This overrides any default branch naming from tooling.
- Keep branches short-lived and scoped to one logical change.
- Commit messages and PR titles use Conventional Commits: `type(scope): summary`.
- Open pull requests into `main`. Merge by squash only. No force-push or history rewrites on shared branches.
- Before pushing, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` must pass.
