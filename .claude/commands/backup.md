---
name: backup
description: Feature-aware backup for PunIntended. Groups uncommitted changes by logical feature, creates one atomic commit per feature, bumps version in app/package.json and CHANGELOG.md, then pushes to origin.
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(docker *), Read, Edit
---

Execute a feature-aware backup cycle for PunIntended. Bump type from $ARGUMENTS (patch|minor|major, default: auto-detect).

## Phase 1: Analyse & Group Changes
1. Run `git status --porcelain` and `git diff` (staged + unstaged) to inventory ALL modified, deleted, and untracked files.
2. Analyse the changes and group them into **logical features** — each group should represent one coherent unit of work. Use file paths, diff content, and naming conventions to infer groupings. Examples of good groupings for this project:
   - A new React component with its hook and any related API wiring (e.g. `ChallengeHistoryPanel.tsx` + `useChallengeHistory.ts`)
   - A backend route or middleware change with any matching DB query functions (`server.js` + `database.js`)
   - A schema change with the corresponding migration logic (`schema.sql` + `database.js`)
   - A frontend hook change with the API client update that drives it (`usePuns.ts` + `client.ts`)
   - A standalone UI tweak or style change (`App.tsx`, `GameBoard.tsx`)
   - A config or infra change (`compose.yaml`, `Dockerfile`)
   - **Never stage `.env`** — it contains secrets and is gitignored for good reason.
3. Present the proposed groupings to the user as a numbered list, each with a suggested conventional commit message (`feat:`, `fix:`, `chore:`). Ask the user to confirm or adjust before proceeding.

## Phase 2: Atomic Commits (one per feature)
4. For each confirmed group, in order:
   a. Stage ONLY the files belonging to that group using `git add <file1> <file2> ...` (never `git add .` or `git add -A`).
   b. Confirm `.env` is NOT staged — abort if it appears in `git diff --cached`.
   c. Run `git commit -m "<conventional commit message>"`.
   d. Report the commit hash and message.
5. After all groups are committed, run `git status` to verify no uncommitted changes remain (ignoring `.env`). If stragglers exist, propose one final `chore:` commit for them.

## Phase 3: Smart Versioning & Changelog
6. Review ALL commits created in Phase 2 to determine the highest-priority bump:
   - If ANY commit is `feat:` → bump MINOR.
   - Else if ANY commit is `fix:` → bump PATCH.
   - Else (all `chore:`/`refactor:`) → skip versioning, go to Phase 4.
   - The user's $ARGUMENTS override auto-detection if provided.
7. For MINOR or PATCH bumps:
   a. Bump `version` in `app/package.json` only (there is no separate `api/package.json` in this project).
   b. Add a `## [X.Y.Z] - YYYY-MM-DD` entry in correct descending version order to `CHANGELOG.md` at the repo root, with `- change` bullets summarising EACH feature commit.
   c. Run `git add app/package.json CHANGELOG.md`.
   d. Run `git commit -m "chore(release): vX.Y.Z"`.
   e. Run `git tag vX.Y.Z`.

## Phase 4: Push
8. Run `git push origin HEAD`.
9. If a tag was created, run `git push --tags`.
10. Print a summary table:
    - Number of feature commits created
    - Each commit's hash, track, and message
    - New version (if bumped)
    - Confirmation of push to `origin/main`

## Optional: Database Snapshot
If the user requests a DB backup (e.g. `backup db`), run a `pg_dump` before committing:
```bash
docker exec punintended-db pg_dump -U punintended punintended > db_backup_$(date +%Y%m%d_%H%M%S).sql
```
Store the dump outside the repo (it contains user data). Never commit it.
