---
title: Agent-safe git
description: Active-branch flow with one worktree per agent, a line cap, and a human merge
alwaysApply: true
---

Read BRANCHING.md before any git command. BRANCHING.md is the source of truth for git.

- Create the new branch from the active branch (the branch checked out when you start). Never commit directly to the active branch itself; always work on a new branch from it.
- Branch names: `<type>/<short-kebab-description>`, type one of `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `hotfix` (e.g. `feat/login-page`). Lowercase, under 50 characters.
- Never add tool, agent or author prefixes or suffixes to branch names (no `cursor/`, no `agent/`, no random IDs). This overrides any default branch naming from tooling.
- Keep branches short-lived and scoped to one logical change.
- Commit messages and PR titles use Conventional Commits: `type(scope): summary`.
- Open the pull request back into the active branch it was created from, unless the active branch is `main`. Squash merge only. No force-push or history rewrites on shared branches.
- Before pushing, `npm run lint`, `npm run typecheck`, and `npm run build` must pass.

Sync the active branch first. Note its name, run `git fetch origin`, and pull that branch from origin. Resolve conflicts, then create the `<type>/<short-kebab-description>` branch. If the active branch has no remote, use it as it is locally. Do not switch to or merge in `main`.

Create one git worktree per agent from the active branch. Cap the pull request at 400 lines, excluding lockfiles. A human merges. Agents never merge their own pull requests. A ticket id may go in the description (e.g. `feat/128-login`).
