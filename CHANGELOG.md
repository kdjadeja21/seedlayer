# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--ui` (`shadcn` or `none`) and `--density` (`compact`, `comfortable`, or `spacious`) in the CLI, saved answers, and the web configurator. `--ui none` skips the shadcn files and the shadcn steps in the agent rules.

## [0.1.0] - 2026-11-15

### Added

- `seedlayer` command that generates a Next.js app and the AI context layer from one config.
- Presets `startup-speed`, `team-strict`, and `hackathon-2h`.
- Arrow-key prompts, saved answers in `~/.seedlayer.json`, and `--yes` / `--no-interactive` for CI.
- `sl1` config codes and the web configurator.
- Packages `@seedlayer/core` and `@seedlayer/packs`.
