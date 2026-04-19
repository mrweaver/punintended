---
name: "PunIntended Changelog"
description: "Generate or update a Keep a Changelog release entry for PunIntended and sync the generated public changelog copy used by the app."
argument-hint: "auto | patch | minor | major | X.Y.Z"
agent: "agent"
---

Execute the PunIntended changelog workflow. Resolve the target version from the argument when provided: `auto`, `patch`, `minor`, `major`, or an explicit `X.Y.Z` version.

Phase 1: Context Gathering

1. Read `app/package.json` and the root `CHANGELOG.md`.
2. Run `git describe --tags --abbrev=0` to find the latest release tag. If a tag exists, inspect commits since that tag with `git log <tag>..HEAD --oneline`. If no tag exists, inspect recent commits with `git log --oneline -20`.
3. If staged or modified release-note-relevant changes exist, inspect `git status --porcelain` and the relevant diffs so the draft reflects the actual pending release.
4. Determine the target version using this priority:
   - explicit `X.Y.Z` argument
   - `patch`, `minor`, or `major` bump from `app/package.json`
   - the already bumped `app/package.json` version when this workflow is run from backup
   - inferred next version from commit history (`feat:` => minor, `fix:` => patch, otherwise no automatic bump)

Phase 2: Categorisation

5. Draft release notes using Keep a Changelog headings only when they contain entries:
   - `### Added`
   - `### Changed`
   - `### Deprecated`
   - `### Removed`
   - `### Fixed`
   - `### Security`
6. Write concise, user-facing bullet points that describe what changed and why it matters.
7. Preserve existing changelog information. If the target version already exists in `CHANGELOG.md`, update that version block in place instead of creating a duplicate heading.

Phase 3: Draft and Confirm

8. Draft the entry header as `## [X.Y.Z] - YYYY-MM-DD` using today's date.
9. Present the draft to the user for confirmation before writing any files.
10. State clearly whether the workflow will insert a new version block or update an existing one.

Phase 4: Write and Sync

11. After confirmation, write the entry into the root `CHANGELOG.md` in descending version order.
12. Run `npm --prefix app run sync:changelog` so the generated `app/public/changelog.md` copy matches the root changelog for local app use.
13. Do not stage `app/public/changelog.md`; it is generated and gitignored. Only the root `CHANGELOG.md` should be committed.
14. Report the final version written and confirm that the root changelog and generated public copy are in sync.
