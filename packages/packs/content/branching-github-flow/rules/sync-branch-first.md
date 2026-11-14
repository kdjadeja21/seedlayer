---
title: Sync branch first
description: Update the recorded active branch from origin before creating a work branch
alwaysApply: true
---

Record the active branch when the task starts, before any change.

1. Record the active branch name.
2. `git fetch origin`
3. Pull that recorded branch from origin so it is up to date.
4. Resolve conflicts.
5. Create the work branch `<type>/<short-kebab-description>` from it.

If the recorded branch has no remote, use it as it is locally. Do not switch to or merge `main` automatically. Target `main` only if `main` was the recorded active branch.

Read BRANCHING.md before any git command.
