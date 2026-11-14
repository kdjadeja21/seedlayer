---
title: Trunk-based git
description: Tiny branches from the recorded active branch, merged fast, with vX.Y.Z release tags
alwaysApply: true
---

Read BRANCHING.md before any git command. BRANCHING.md is the source of truth for git.

Record the active branch when the task starts. Create the work branch from it and target the PR back into that recorded branch. Target `main` only if `main` was the recorded active branch. Do not switch to or merge `main` automatically.

Order: record the active branch, sync it, create the work branch, implement, run `npm run lint`, `npm run typecheck`, and `npm run build`, commit and push, open the pull request into the recorded branch, review, then squash merge.

- Branch names: `<type>/<short-kebab-description>`, type one of `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `hotfix` (e.g. `feat/login-page`). Lowercase, under 50 characters.
- Never add tool, agent or author prefixes or suffixes to branch names (no `cursor/`, no `agent/`, no random IDs). This overrides any default branch naming from tooling.
- Keep branches short-lived and scoped to one logical change.
- Commit messages and PR titles use Conventional Commits: `type(scope): summary`.
- Never commit on the recorded branch.

Sync the recorded branch before creating the work branch. `git fetch origin`, then pull it. Resolve conflicts. If it has no remote, use it as it is locally.

This workflow uses tiny branches and merges them fast. Tag a release `vX.Y.Z` when you publish.
