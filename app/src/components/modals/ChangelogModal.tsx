import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import packageInfo from "../../../package.json";

const CHANGELOG_URL = "/changelog.md";
const RELEASE_HEADING = /^## \[(.+?)\](?:\s*-\s*(.+))?$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const BULLET_LINE = /^\s*[-*]\s+/;
const SECTION_ORDER = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
  "Notes",
] as const;

interface ChangelogModalProps {
  onClose: () => void;
}

type SectionTone =
  | "added"
  | "changed"
  | "deprecated"
  | "removed"
  | "fixed"
  | "security"
  | "notes";

interface ReleaseSection {
  id: string;
  heading: string;
  content: string;
  bulletCount: number;
  noteCount: number;
  tone: SectionTone;
}

interface Release {
  id: string;
  version: string;
  date: string;
  overview: string;
  sections: ReleaseSection[];
  noteCount: number;
  searchText: string;
}

function normalizeVersion(version: string): string {
  return String(version || "")
    .trim()
    .replace(/^v/i, "")
    .replace(/^\[(.*)\]$/, "$1");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function compareSemver(a: string, b: string): number {
  const pa = String(a)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const pb = String(b)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  for (let index = 0; index < 3; index += 1) {
    const diff = (pb[index] || 0) - (pa[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function compareReleaseVersions(a: string, b: string): number {
  const normalizedA = normalizeVersion(a).toLowerCase();
  const normalizedB = normalizeVersion(b).toLowerCase();

  if (normalizedA === "unreleased") return -1;
  if (normalizedB === "unreleased") return 1;

  return compareSemver(normalizedA, normalizedB);
}

function getSectionTone(heading: string): SectionTone {
  const normalizedHeading = heading.trim().toLowerCase();

  if (normalizedHeading.includes("added")) return "added";
  if (
    normalizedHeading.includes("changed") ||
    normalizedHeading.includes("improved")
  ) {
    return "changed";
  }
  if (normalizedHeading.includes("deprecated")) return "deprecated";
  if (normalizedHeading.includes("removed")) return "removed";
  if (normalizedHeading.includes("fixed")) return "fixed";
  if (normalizedHeading.includes("security")) return "security";

  return "notes";
}

function getSectionSortIndex(heading: string): number {
  const index = SECTION_ORDER.findIndex(
    (entry) => entry.toLowerCase() === heading.trim().toLowerCase(),
  );
  return index === -1 ? SECTION_ORDER.length : index;
}

function getSectionBadgeClasses(tone: SectionTone): string {
  switch (tone) {
    case "added":
      return "border border-success bg-success-subtle text-success";
    case "changed":
      return "border border-warning bg-warning-subtle text-warning";
    case "deprecated":
      return "border border-warning bg-warning-subtle text-warning";
    case "removed":
      return "border border-danger bg-danger-subtle text-danger";
    case "fixed":
      return "border border-info bg-info-subtle text-info";
    case "security":
      return "border border-danger bg-danger-subtle text-danger";
    case "notes":
    default:
      return "border border-accent-border bg-accent-subtle text-accent-foreground";
  }
}

function countBulletLines(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => BULLET_LINE.test(line.trimStart())).length;
}

function buildSection(
  heading: string,
  content: string,
  index: number,
): ReleaseSection {
  const trimmedContent = content.trim();
  const bulletCount = countBulletLines(trimmedContent);

  return {
    id: `${slugify(heading || "notes")}-${index}`,
    heading,
    content: trimmedContent,
    bulletCount,
    noteCount: bulletCount || (trimmedContent ? 1 : 0),
    tone: getSectionTone(heading),
  };
}

function parseReleaseContent(content: string) {
  const lines = content.split(/\r?\n/);
  const overviewLines: string[] = [];
  const sections: ReleaseSection[] = [];
  let activeSectionHeading: string | null = null;
  let activeSectionLines: string[] = [];

  const flushActiveSection = () => {
    if (!activeSectionHeading) return;

    const nextSection = buildSection(
      activeSectionHeading,
      activeSectionLines.join("\n"),
      sections.length,
    );

    if (nextSection.content) {
      sections.push(nextSection);
    }

    activeSectionHeading = null;
    activeSectionLines = [];
  };

  lines.forEach((line) => {
    const sectionMatch = line.match(SECTION_HEADING);

    if (sectionMatch) {
      flushActiveSection();
      activeSectionHeading = sectionMatch[1].trim() || "Notes";
      activeSectionLines = [];
      return;
    }

    if (activeSectionHeading) {
      activeSectionLines.push(line);
      return;
    }

    overviewLines.push(line);
  });

  flushActiveSection();

  const overview = overviewLines.join("\n").trim();
  const orderedSections = [...sections].sort((left, right) => {
    const orderDiff =
      getSectionSortIndex(left.heading) - getSectionSortIndex(right.heading);
    if (orderDiff !== 0) return orderDiff;
    return left.heading.localeCompare(right.heading);
  });

  if (!orderedSections.length && overview) {
    const fallbackSection = buildSection("Notes", overview, 0);
    return {
      overview: "",
      sections: [fallbackSection],
      noteCount: fallbackSection.noteCount,
      searchText: `${fallbackSection.heading}\n${fallbackSection.content}`,
    };
  }

  const sectionNoteCount = orderedSections.reduce(
    (sum, section) => sum + section.noteCount,
    0,
  );

  return {
    overview,
    sections: orderedSections,
    noteCount: sectionNoteCount + (overview ? 1 : 0),
    searchText: [
      overview,
      ...orderedSections.map(
        (section) => `${section.heading}\n${section.content}`,
      ),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function parseChangelog(raw: string): Release[] {
  const lines = raw.split(/\r?\n/);
  const mergedReleases = new Map<
    string,
    {
      version: string;
      date: string;
      parts: string[];
    }
  >();
  let activeVersion: string | null = null;
  let activeDate = "Pending release";
  let sectionStart = 0;

  const flushActiveRelease = (endIndex: number) => {
    if (!activeVersion) return;

    const key = `${normalizeVersion(activeVersion)}|${activeDate}`;
    const existing = mergedReleases.get(key);
    const content = lines.slice(sectionStart, endIndex).join("\n").trim();

    if (existing) {
      if (content) {
        existing.parts.push(content);
      }
      return;
    }

    mergedReleases.set(key, {
      version: activeVersion,
      date: activeDate,
      parts: content ? [content] : [],
    });
  };

  lines.forEach((line, index) => {
    const headingMatch = line.match(RELEASE_HEADING);
    if (!headingMatch) return;

    flushActiveRelease(index);
    activeVersion = headingMatch[1];
    activeDate = headingMatch[2] || "Pending release";
    sectionStart = index + 1;
  });

  flushActiveRelease(lines.length);

  return Array.from(mergedReleases.values())
    .map(({ version, date, parts }) => {
      const content = parts.join("\n\n").trim();
      const parsedContent = parseReleaseContent(content);
      const stableId = slugify(`${normalizeVersion(version)}-${date}`);

      return {
        id: stableId || `${normalizeVersion(version)}-${date}`,
        version,
        date,
        overview: parsedContent.overview,
        sections: parsedContent.sections,
        noteCount: parsedContent.noteCount,
        searchText:
          `${version}\n${date}\n${parsedContent.searchText}`.toLowerCase(),
      } satisfies Release;
    })
    .sort((left, right) => {
      const versionDiff = compareReleaseVersions(left.version, right.version);
      if (versionDiff !== 0) return versionDiff;
      return right.date.localeCompare(left.date);
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(children: ReactNode, query: string): ReactNode {
  if (!query) return children;

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return children;

  const queryPattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi");

  return Children.map(children, (child): ReactNode => {
    if (typeof child === "string") {
      if (!child.toLowerCase().includes(normalizedQuery.toLowerCase())) {
        return child;
      }

      const parts = child.split(queryPattern);
      return parts.map((part, index) =>
        part.toLowerCase() === normalizedQuery.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className="rounded-sm bg-accent-subtle text-accent-foreground"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      );
    }

    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return cloneElement(child, {
        children: highlightText(child.props.children, normalizedQuery),
      });
    }

    return child;
  });
}

function MarkdownBlock({
  content,
  searchQuery,
}: {
  content: string;
  searchQuery: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children, ...props }) => (
          <p className="text-sm leading-6 text-text-secondary" {...props}>
            {highlightText(children, searchQuery)}
          </p>
        ),
        ul: ({ children, ...props }) => (
          <ul
            className="ml-5 list-disc space-y-2 text-sm text-text-secondary"
            {...props}
          >
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol
            className="ml-5 list-decimal space-y-2 text-sm text-text-secondary"
            {...props}
          >
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="pl-1 leading-relaxed" {...props}>
            {highlightText(children, searchQuery)}
          </li>
        ),
        a: ({ children, ...props }) => (
          <a
            className="font-medium text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
            target="_blank"
            rel="noreferrer"
            {...props}
          >
            {children}
          </a>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-semibold text-foreground" {...props}>
            {children}
          </strong>
        ),
        code: ({ children, className, ...props }) => (
          <code
            className={`rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[13px] text-foreground ${className || ""}`.trim()}
            {...props}
          >
            {children}
          </code>
        ),
        pre: ({ children, ...props }) => (
          <pre
            className="overflow-x-auto rounded-2xl border border-border bg-surface px-4 py-3"
            {...props}
          >
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ReleaseEntry({
  release,
  isCurrent,
  isExpanded,
  onToggle,
  searchQuery,
}: {
  release: Release;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  searchQuery: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border bg-surface shadow-sm transition-colors hover:border-accent-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-4 px-5 py-4 text-left"
      >
        <div className="mt-0.5 shrink-0 rounded-full border border-border bg-surface-muted p-1.5 text-text-muted">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-accent">
              {release.version === "Unreleased"
                ? release.version
                : `v${release.version}`}
            </span>
            {isCurrent && (
              <span className="rounded-full border border-accent-border bg-accent-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-foreground">
                Current
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {release.date}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {release.noteCount} note{release.noteCount === 1 ? "" : "s"}
            </span>
          </div>

          {release.sections.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {release.sections.slice(0, 4).map((section) => (
                <span
                  key={section.id}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSectionBadgeClasses(
                    section.tone,
                  )}`}
                >
                  {section.heading}
                  {section.bulletCount > 0 ? ` ${section.bulletCount}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 pb-5 pt-4">
              {release.overview && (
                <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
                  <MarkdownBlock
                    content={release.overview}
                    searchQuery={searchQuery}
                  />
                </div>
              )}

              <div className="mt-4 space-y-3">
                {release.sections.map((section) => (
                  <section
                    key={section.id}
                    className="rounded-2xl border border-border bg-surface-muted px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSectionBadgeClasses(
                          section.tone,
                        )}`}
                      >
                        {section.heading}
                      </span>
                      {section.bulletCount > 0 && (
                        <span className="text-xs text-text-muted">
                          {section.bulletCount} bullet
                          {section.bulletCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    <div className="mt-3">
                      <MarkdownBlock
                        content={section.content}
                        searchQuery={searchQuery}
                      />
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const [rawChangelog, setRawChangelog] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadChangelog() {
      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await fetch(
          `${CHANGELOG_URL}?v=${encodeURIComponent(packageInfo.version)}`,
          { cache: "no-store", signal: abortController.signal },
        );

        if (!response.ok) {
          throw new Error(`Unable to load changelog (${response.status})`);
        }

        setRawChangelog(await response.text());
        setStatus("ready");
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;

        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load changelog.",
        );
      }
    }

    loadChangelog();
    return () => abortController.abort();
  }, []);

  const releases = useMemo(() => parseChangelog(rawChangelog), [rawChangelog]);
  const currentVersion = normalizeVersion(packageInfo.version);
  const currentRelease = useMemo(
    () =>
      releases.find(
        (release) => normalizeVersion(release.version) === currentVersion,
      ) ?? releases[0],
    [currentVersion, releases],
  );
  const totalNotes = useMemo(
    () => releases.reduce((sum, release) => sum + release.noteCount, 0),
    [releases],
  );

  const filteredReleases = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return releases;

    return releases.filter((release) =>
      release.searchText.includes(normalizedQuery),
    );
  }, [releases, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!releases.length) {
      setExpanded({});
      return;
    }

    const defaultExpandedId = currentRelease?.id ?? releases[0]?.id;
    const nextExpanded = Object.fromEntries(
      releases.map((release) => [release.id, release.id === defaultExpandedId]),
    );

    setExpanded(nextExpanded);
  }, [currentRelease, releases]);

  const allFilteredExpanded =
    filteredReleases.length > 0 &&
    filteredReleases.every((release) => expanded[release.id]);

  function toggleRelease(releaseId: string) {
    setExpanded((previous) => ({
      ...previous,
      [releaseId]: !previous[releaseId],
    }));
  }

  function toggleFilteredReleases() {
    const nextState = Object.fromEntries(
      filteredReleases.map((release) => [release.id, !allFilteredExpanded]),
    );

    setExpanded((previous) => ({
      ...previous,
      ...nextState,
    }));
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border bg-surface text-foreground shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-accent-border hover:bg-accent-subtle hover:text-accent"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="shrink-0 border-b border-border px-6 pb-5 pt-6">
          <div className="pr-12">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
              Release Notes
            </p>
            <h3 className="mt-2 text-3xl font-serif italic text-foreground">
              What&apos;s New
            </h3>
            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-text-secondary sm:block">
              Search PunIntended&apos;s release history, compare feature drops
              and fixes, and jump straight to the current build notes.
            </p>
          </div>

          <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-3">
            <SummaryChip
              icon={Sparkles}
              label="Current Build"
              value={`v${currentVersion}`}
            />
            <SummaryChip
              icon={CalendarDays}
              label="Tracked Releases"
              value={`${releases.length}`}
            />
            <SummaryChip
              icon={FileText}
              label="Indexed Notes"
              value={`${totalNotes}`}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search releases, features, or fixes..."
                className="w-full rounded-2xl border border-border bg-surface px-10 py-3 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-text-muted focus:border-accent"
              />
            </label>

            {!isSearching && (
              <button
                type="button"
                onClick={toggleFilteredReleases}
                disabled={filteredReleases.length === 0}
                aria-label={allFilteredExpanded ? "Collapse all visible releases" : "Expand all visible releases"}
                title={allFilteredExpanded ? "Collapse all visible releases" : "Expand all visible releases"}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-text-secondary transition-colors hover:border-accent-border hover:bg-accent-subtle hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronsUpDown className="h-4 w-4" />
                <span className="sr-only">
                  {allFilteredExpanded
                    ? "Collapse all visible releases"
                    : "Expand all visible releases"}
                </span>
              </button>
            )}
          </div>

          {status === "ready" && releases.length > 0 && currentRelease && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-accent-border bg-accent-subtle px-2.5 py-1 font-semibold text-accent-foreground">
                Spotlight:{" "}
                {currentRelease.version === "Unreleased"
                  ? currentRelease.version
                  : `v${currentRelease.version}`}
              </span>
              <span>{currentRelease.date}</span>
              <span>&bull;</span>
              <span>
                {filteredReleases.length === releases.length
                  ? `${releases.length} releases visible`
                  : `${filteredReleases.length} of ${releases.length} releases visible`}
              </span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {status === "loading" && (
            <div className="rounded-[1.5rem] border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
              Loading changelog...
            </div>
          )}

          {status === "error" && (
            <div className="rounded-[1.5rem] border border-danger bg-danger-subtle px-4 py-4 text-sm text-danger">
              {errorMessage}
            </div>
          )}

          {status === "ready" && filteredReleases.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
              {searchQuery.trim()
                ? "No matching releases found for that search."
                : "No release entries were found in the changelog."}
            </div>
          )}

          {status === "ready" && filteredReleases.length > 0 && (
            <div className="space-y-3">
              {filteredReleases.map((release) => (
                <ReleaseEntry
                  key={release.id}
                  release={release}
                  isCurrent={
                    normalizeVersion(release.version) === currentVersion
                  }
                  isExpanded={isSearching || Boolean(expanded[release.id])}
                  onToggle={() => toggleRelease(release.id)}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          )}

          <div className="h-1" aria-hidden />
        </div>
      </motion.div>
    </div>
  );
}
