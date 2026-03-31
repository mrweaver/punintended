---
name: "PunIntended Backup"
description: "Feature-aware backup for PunIntended: group local changes, confirm commit plan, version if needed, and push safely. Use when: running the PunIntended backup workflow."
argument-hint: "patch | minor | major | auto"
agent: "agent"
---

Execute the PunIntended backup workflow. Interpret the argument as the requested version bump override: `patch`, `minor`, `major`, or `auto` when omitted.

Phase 1: Analyse and Group Changes

1. Run `git status --porcelain` and inspect both staged and unstaged diffs to inventory every modified, deleted, and untracked file.
2. Group the changes into logical feature commits using file paths and diff content. Keep each group coherent and avoid mixing unrelated work.
3. Never stage `.env`.
4. Present the proposed groups as a numbered list with a suggested conventional commit message for each group.
5. Ask the user to confirm or adjust the grouping before creating commits.

Phase 2: Atomic Commits

6. For each confirmed group, stage only the files in that group. Do not use `git add .` or `git add -A`.
7. Check `git diff --cached` and abort if `.env` is staged.
8. Create one commit per group using the proposed conventional commit message.
9. After each commit, report the commit hash and message.
10. When all groups are committed, run `git status` and verify that no intended changes remain uncommitted.
11. If leftover tracked changes remain, propose one final `chore:` commit for them before moving on.

Phase 3: Smart Versioning and Changelog

12. Determine the highest required release bump from the commits created in Phase 2:
   - any `feat:` commit means a minor bump
   - otherwise any `fix:` commit means a patch bump
   - otherwise skip versioning
   - if the user supplied an override argument, use that instead
13. For a patch or minor bump:
   - update only `app/package.json`
   - add a new top-level dated entry to `CHANGELOG.md` in descending version order
   - summarize each feature commit as a bullet in the changelog
   - commit the version files as `chore(release): vX.Y.Z`
   - create the matching git tag `vX.Y.Z`

Phase 4: Push

14. Push the current branch to `origin`.
15. If a tag was created, push tags as well.
16. Print a concise summary with the number of feature commits, the commit hashes and messages, the new version if any, and confirmation that the branch was pushed.

Optional database snapshot

If the user explicitly asks for a database backup, run:

```bash
docker exec punintended-db pg_dump -U punintended punintended > ../db_backup_$(date +%Y%m%d_%H%M%S).sql
```

Store the dump outside the repo and never commit it.