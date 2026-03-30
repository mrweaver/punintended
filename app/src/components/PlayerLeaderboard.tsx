import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { getPunScore } from '../hooks/usePuns';
import type { Pun, Player } from '../api/client';

interface Props {
  puns: Pun[];
  players: Player[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function PlayerLeaderboard({ puns, players }: Props) {
  const ranked = useMemo(() => {
    const bestMap = new Map<number, number>();
    for (const pun of puns) {
      const score = getPunScore(pun);
      if (score > 0) {
        bestMap.set(pun.authorId, Math.max(bestMap.get(pun.authorId) ?? 0, score));
      }
    }
    return players
      .map((p) => ({ player: p, best: bestMap.get(p.uid) ?? null }))
      .filter((e) => e.best !== null)
      .sort((a, b) => (b.best ?? 0) - (a.best ?? 0))
      .slice(0, 3);
  }, [puns, players]);

  if (ranked.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm">
      <div className="flex flex-col shrink-0">
        <Trophy className="w-4 h-4 text-orange-500 dark:text-violet-400" />
      </div>
      <div className="flex items-center gap-4 flex-wrap flex-1">
        {ranked.map((entry, i) => (
          <div key={entry.player.uid} className="flex items-center gap-1.5">
            <span className="text-base leading-none">{MEDALS[i]}</span>
            <img
              src={entry.player.photoURL}
              className="w-5 h-5 rounded-full"
              alt={entry.player.name}
            />
            <span className="text-xs font-medium text-gray-700 dark:text-zinc-300 truncate max-w-[80px]">
              {entry.player.name.split(' ')[0]}
            </span>
            <span className="text-[10px] font-mono text-orange-500 dark:text-violet-400">
              {entry.best!.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 shrink-0">
        best · today
      </span>
    </div>
  );
}
