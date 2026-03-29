import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronRight } from 'lucide-react';
import packageInfo from '../../../package.json';

const CHANGELOG_URL = '/changelog.md';

interface ChangelogModalProps {
  onClose: () => void;
}

interface Release {
  version: string;
  date: string;
  content: string;
}

function normalizeVersion(version: string): string {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .replace(/^\[(.*)\]$/, '$1');
}

function compareSemver(a: string, b: string): number {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseChangelog(raw: string): Release[] {
  const releases: Release[] = [];
  const lines = raw.split(/\r?\n/);
  let currentRelease: Release | null = null;
  let sectionStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const headingMatch = lines[index].match(/^## \[(.+?)\](?:\s*-\s*(.+))?$/);
    if (!headingMatch) continue;

    if (currentRelease) {
      currentRelease.content = lines.slice(sectionStart, index).join('\n').trim();
    }

    currentRelease = {
      version: headingMatch[1],
      date: headingMatch[2] || 'Pending release',
      content: '',
    };
    releases.push(currentRelease);
    sectionStart = index + 1;
  }

  if (currentRelease) {
    currentRelease.content = lines.slice(sectionStart).join('\n').trim();
  }

  releases.sort((a, b) => compareSemver(a.version, b.version));
  return releases;
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h3: ({ children, ...props }) => (
          <h4 className="mt-3 text-sm font-semibold text-gray-900 dark:text-zinc-100" {...props}>
            {children}
          </h4>
        ),
        p: ({ children, ...props }) => (
          <p className="text-sm leading-6 text-gray-500 dark:text-zinc-400" {...props}>
            {children}
          </p>
        ),
        ul: ({ children, ...props }) => (
          <ul className="ml-5 list-disc space-y-1 text-sm text-gray-500 dark:text-zinc-400" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="ml-5 list-decimal space-y-1 text-sm text-gray-500 dark:text-zinc-400" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="pl-1" {...props}>{children}</li>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-semibold text-gray-900 dark:text-zinc-100" {...props}>
            {children}
          </strong>
        ),
        a: ({ children, ...props }) => (
          <a className="text-orange-600 dark:text-violet-400 underline underline-offset-4" target="_blank" rel="noreferrer" {...props}>
            {children}
          </a>
        ),
      }}
    >
      {content || 'No changelog notes yet.'}
    </ReactMarkdown>
  );
}

function ReleaseEntry({
  release,
  isCurrent,
  isExpanded,
  onToggle,
}: {
  release: Release;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-800/50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-zinc-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-zinc-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-orange-600 dark:text-violet-400">
              {release.version === 'Unreleased' ? release.version : `v${release.version}`}
            </span>
            {isCurrent && (
              <span className="rounded-full bg-orange-100 dark:bg-violet-900/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-orange-600 dark:text-violet-400">
                Current
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">{release.date}</p>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-zinc-800 px-4 py-3">
          <MarkdownBlock content={release.content} />
        </div>
      )}
    </div>
  );
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const [rawChangelog, setRawChangelog] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const abortController = new AbortController();

    async function loadChangelog() {
      setStatus('loading');
      setErrorMessage('');
      try {
        const response = await fetch(
          `${CHANGELOG_URL}?v=${encodeURIComponent(packageInfo.version)}`,
          { cache: 'no-store', signal: abortController.signal },
        );
        if (!response.ok) throw new Error(`Unable to load changelog (${response.status})`);
        setRawChangelog(await response.text());
        setStatus('ready');
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load changelog.');
      }
    }

    loadChangelog();
    return () => abortController.abort();
  }, []);

  const releases = useMemo(() => parseChangelog(rawChangelog), [rawChangelog]);

  useEffect(() => {
    if (!releases.length) {
      setExpanded({});
      return;
    }
    const currentVersion = normalizeVersion(packageInfo.version);
    const nextExpanded: Record<string, boolean> = {};
    let currentFound = false;

    releases.forEach((release, index) => {
      const isCurrent = normalizeVersion(release.version) === currentVersion;
      nextExpanded[release.version] = isCurrent;
      if (isCurrent) currentFound = true;
      if (!currentFound && index === 0) nextExpanded[release.version] = true;
    });

    setExpanded(nextExpanded);
  }, [releases]);

  function toggleRelease(version: string) {
    setExpanded((prev) => ({ ...prev, [version]: !prev[version] }));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl max-w-md w-full relative shadow-2xl border border-gray-100 dark:border-zinc-800 max-h-[90vh] flex flex-col"
      >
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white p-2"
          >
            ✕
          </button>
          <h3 className="text-2xl font-serif italic dark:text-zinc-100">What's New</h3>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
            PunIntended release history — current version highlighted.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {status === 'loading' && (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-700 px-4 py-6 text-sm text-gray-400 dark:text-zinc-500">
              Loading changelog...
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-4 py-4 text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </div>
          )}

          {status === 'ready' && releases.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-700 px-4 py-6 text-sm text-gray-400 dark:text-zinc-500">
              No release entries were found in the changelog.
            </div>
          )}

          {status === 'ready' &&
            releases.map((release) => (
              <ReleaseEntry
                key={`${release.version}-${release.date}`}
                release={release}
                isCurrent={normalizeVersion(release.version) === normalizeVersion(packageInfo.version)}
                isExpanded={Boolean(expanded[release.version])}
                onToggle={() => toggleRelease(release.version)}
              />
            ))}

          <div className="h-1 shrink-0" aria-hidden />
        </div>
      </motion.div>
    </div>
  );
}
