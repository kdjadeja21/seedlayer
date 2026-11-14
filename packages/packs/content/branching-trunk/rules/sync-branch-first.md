---
title: Sync branch first
description: Update the active branch from origin before creating a working branch
alwaysApply: true
---

Before any change:

1. Note the active branch name (the branch checked out when you start).
2. `git fetch origin`
3. Pull the active branch from origin so it is up to date.
4. Resolve conflicts.
5. Create the new `<type>/<short-kebab-description>` branch from it.

If the active branch has no remote, use it as it is locally. Do not switch to or merge in `main`.

Read BRANCHING.md before any git command.
