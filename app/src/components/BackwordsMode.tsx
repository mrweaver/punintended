import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BookOpenText,
  Brain,
  CheckCircle2,
  EyeOff,
  GripVertical,
  Lock,
  LogOut,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type BackwordsAttempt,
  type BackwordsClueSource,
  type BackwordsGame,
  type BackwordsPublishClue,
  type BackwordsRun,
} from "../api/client";
import { useBackwords } from "../hooks/useBackwords";
import { BackwordsComparison } from "./BackwordsComparison";
import { BackwordsHistory } from "./BackwordsHistory";
import { ShareModal } from "./modals/ShareModal";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { JudgeHint } from "./ui/JudgeHint";
import { buildBackwordsResultsShareMessage } from "../utils/backwordsShare";

interface BackwordsModeProps {
  initialBackwordsId?: string;
  initialComparisonGameId?: string;
  initialHighlightedRunId?: string;
  onExit: () => void;
}

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMeaningfulTokens(value: string) {
  return normalizePhrase(value)
    .split(" ")
    .filter((token) => token.length > 3);
}

interface CraftCard {
  id: string;
  text: string;
  source: BackwordsClueSource;
}

function createCardId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function triggerHaptic(durationMs: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(durationMs);
  }
}

function findTargetLeak(clue: string, targets: string[]) {
  const normalizedClue = normalizePhrase(clue);
  if (!normalizedClue) return null;

  for (const target of targets) {
    const normalizedTarget = normalizePhrase(target);
    if (!normalizedTarget) continue;

    if (normalizedClue.includes(normalizedTarget)) {
      return target;
    }

    for (const token of extractMeaningfulTokens(target)) {
      const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
      if (pattern.test(normalizedClue)) {
        return token;
      }
    }
  }

  return null;
}

function CurateSlots({
  slots,
  onDragEnd,
  onDragStart,
}: {
  slots: CraftCard[];
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 5 },
    }),
  );

  const activeSlots = slots.slice(0, 3);
  const discardSlots = slots.slice(3);

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={slots.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-orange-500 dark:text-violet-400">
            Active Clues · Vague → Obvious
          </p>
          {activeSlots.map((card, index) => (
            <SortableClueCard key={card.id} card={card} index={index} />
          ))}
        </div>

        {discardSlots.length > 0 && (
          <div className="mt-6 space-y-2 border-t-2 border-dashed border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="font-mono text-[11px] uppercase tracking-widest text-gray-400 dark:text-zinc-500">
              Discard Pile
            </p>
            {discardSlots.map((card, index) => (
              <SortableClueCard
                key={card.id}
                card={card}
                index={index + 3}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </DndContext>
  );
}

function SortableClueCard({
  card,
  index,
}: {
  card: CraftCard;
  index: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isActive = index < 3;
  const activeLabels = ["Vague", "Moderate", "Obvious"];
  const positionLabel = isActive ? activeLabels[index] : "Discard";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 rounded-2xl border p-4 transition-shadow ${
        isDragging
          ? "shadow-lg z-10"
          : "shadow-sm"
      } ${
        isActive
          ? "border-orange-200 bg-white dark:border-violet-900/50 dark:bg-zinc-900"
          : "border-zinc-200 bg-zinc-50 opacity-80 dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <button
        type="button"
        aria-label="Reorder clue"
        className="flex h-10 w-8 shrink-0 touch-none items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-gray-400 dark:text-zinc-500">
            {positionLabel}
          </p>
          {card.source === "ai" && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
              <Sparkles className="h-3 w-3" /> AI
            </span>
          )}
        </div>
        <p className="font-serif italic text-zinc-800 dark:text-zinc-200">
          {card.text}
        </p>
      </div>
    </div>
  );
}

function AttemptBreakdown({
  attempt,
  index,
}: {
  attempt: BackwordsAttempt;
  index: number;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-100 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
            Attempt {index + 1}
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">A:</span> {attempt.guess_a}
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">B:</span> {attempt.guess_b}
          </p>
        </div>
        <div
          className={`text-right text-sm font-mono font-bold ${
            attempt.matched
              ? "text-green-600 dark:text-green-400"
              : "text-orange-600 dark:text-orange-400"
          }`}
        >
          {attempt.overall_similarity ?? 0}%
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-gray-500 dark:text-zinc-500">
        <div className="rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-950">
          Topic {attempt.topic_similarity ?? 0}%
        </div>
        <div className="rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-950">
          Focus {attempt.focus_similarity ?? 0}%
        </div>
        <div className="rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-950">
          {attempt.matched ? "Matched" : "Missed"}
        </div>
      </div>

      {attempt.feedback && (
        <p className="flex items-start gap-1.5 text-sm italic text-gray-500 dark:text-zinc-400">
          {attempt.feedback}
          <JudgeHint
            judgeName={attempt.ai_judge_name}
            judgeVersion={attempt.ai_judge_version}
            className="mt-0.5 inline-flex items-center text-gray-400 hover:text-gray-500 dark:text-zinc-500 dark:hover:text-zinc-300"
            iconClassName="h-3.5 w-3.5 shrink-0"
          />
        </p>
      )}
    </div>
  );
}

function CreatorReceipt({
  game,
  onCreateAnother,
  onExit,
  onShare,
  onViewComparison,
}: {
  game: BackwordsGame;
  onCreateAnother: () => void;
  onExit: () => void;
  onShare: () => void;
  onViewComparison: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl space-y-4"
    >
      <Card className="space-y-4 text-center">
        <div className="mx-auto inline-flex rounded-2xl bg-orange-100 p-3 dark:bg-violet-900/30">
          <BookOpenText className="h-8 w-8 text-orange-600 dark:text-violet-400" />
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400">
            Creator Receipt
          </p>
          <h2 className="mt-2 text-3xl font-serif italic dark:text-zinc-100">
            Backwords
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
            {game.topic} + {game.focus}
          </p>
        </div>
        <div className="border-t border-dashed border-zinc-200 pt-4 dark:border-zinc-700">
          <p className="text-5xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
            {(game.creatorScore ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-gray-400 dark:text-zinc-500">
            total clue quality
          </p>
        </div>
      </Card>

      {game.clues.map((clue, index) => (
        <motion.div
          key={`${clue.pun_text}-${index}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08 }}
        >
          <Card className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                  Clue {index + 1}
                </p>
                <p className="mt-2 font-serif text-lg italic text-zinc-800 dark:text-zinc-200">
                  “{clue.pun_text}”
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {clue.ai_score ?? 0}/10
                </p>
                <p className="text-xs text-gray-400 dark:text-zinc-500">
                  {(clue.clue_score ?? 0).toLocaleString()} pts
                </p>
              </div>
            </div>

            {clue.ai_feedback && (
              <p className="flex items-start gap-1.5 text-sm italic text-gray-500 dark:text-zinc-400">
                {clue.ai_feedback}
                <JudgeHint
                  judgeName={clue.ai_judge_name}
                  judgeVersion={clue.ai_judge_version}
                  className="mt-0.5 inline-flex items-center text-gray-400 hover:text-gray-500 dark:text-zinc-500 dark:hover:text-zinc-300"
                  iconClassName="h-3.5 w-3.5 shrink-0"
                />
              </p>
            )}
          </Card>
        </motion.div>
      ))}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={onShare} variant="secondary" className="flex-1">
          <Share2 className="h-4 w-4" /> Share Results
        </Button>
        <Button onClick={onViewComparison} variant="outline" className="flex-1">
          <Search className="h-4 w-4" /> View Results
        </Button>
        <Button onClick={onCreateAnother} variant="outline" className="flex-1">
          <RotateCcw className="h-4 w-4" /> Create Another
        </Button>
        <Button onClick={onExit} variant="ghost">
          <LogOut className="h-4 w-4" /> Exit
        </Button>
      </div>
    </motion.div>
  );
}

function GuesserReceipt({
  game,
  run,
  onCreateAnother,
  onExit,
  onShare,
  onViewComparison,
}: {
  game: BackwordsGame;
  run: BackwordsRun;
  onCreateAnother: () => void;
  onExit: () => void;
  onShare: () => void;
  onViewComparison: () => void;
}) {
  const solved = run.status === "solved";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl space-y-4"
    >
      <Card className="space-y-4 text-center">
        <div
          className={`mx-auto inline-flex rounded-2xl p-3 ${
            solved
              ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
              : "bg-orange-100 text-orange-600 dark:bg-violet-900/30 dark:text-violet-400"
          }`}
        >
          {solved ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : (
            <XCircle className="h-8 w-8" />
          )}
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400">
            {solved ? "Cipher Cracked" : "Case Unsolved"}
          </p>
          <h2 className="mt-2 text-3xl font-serif italic dark:text-zinc-100">
            Backwords
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
            {game.topic} + {game.focus}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-dashed border-zinc-200 pt-4 dark:border-zinc-700">
          <div>
            <p className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
              {run.bestSimilarity ?? 0}%
            </p>
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              best similarity
            </p>
          </div>
          <div>
            <p className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
              {run.attemptsUsed}
            </p>
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              attempts used
            </p>
          </div>
        </div>
      </Card>

      {run.attempts.map((attempt, index) => (
        <AttemptBreakdown
          key={`${run.id}-${index}`}
          attempt={attempt}
          index={index}
        />
      ))}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={onShare} variant="secondary" className="flex-1">
          <Share2 className="h-4 w-4" /> Share Puzzle
        </Button>
        <Button onClick={onViewComparison} variant="outline" className="flex-1">
          <Search className="h-4 w-4" /> View Results
        </Button>
        <Button onClick={onCreateAnother} variant="outline" className="flex-1">
          <RotateCcw className="h-4 w-4" /> Create New Puzzle
        </Button>
        <Button onClick={onExit} variant="ghost">
          <LogOut className="h-4 w-4" /> Exit
        </Button>
      </div>
    </motion.div>
  );
}

export function BackwordsMode({
  initialBackwordsId,
  initialComparisonGameId,
  initialHighlightedRunId,
  onExit,
}: BackwordsModeProps) {
  const {
    role,
    phase,
    game,
    run,
    submitting,
    error,
    startBackwords,
    publishClues,
    generateClues,
    submitGuess,
    reset,
  } = useBackwords(initialBackwordsId);

  const [comparisonGameId, setComparisonGameId] = useState<string | null>(
    initialComparisonGameId ?? null,
  );
  const [comparisonHighlightRunId, setComparisonHighlightRunId] = useState<
    string | null
  >(initialHighlightedRunId ?? null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [staging, setStaging] = useState<CraftCard[]>([]);
  const [draft, setDraft] = useState("");
  const [craftStep, setCraftStep] = useState<"input" | "curate">("input");
  const [slots, setSlots] = useState<CraftCard[]>([]);
  const [generating, setGenerating] = useState(false);
  const [guessA, setGuessA] = useState("");
  const [guessB, setGuessB] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const guessARef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (role === "creator" && phase === "crafting" && game?.id) {
      setStaging([]);
      setDraft("");
      setSlots([]);
      setCraftStep("input");
      setGenerating(false);
      setLocalError(null);
    }
  }, [game?.id, phase, role]);

  useEffect(() => {
    if (role === "guesser" && phase === "guessing") {
      setGuessA("");
      setGuessB("");
      setLocalError(null);
    }
  }, [phase, role, run?.attemptsUsed]);

  useEffect(() => {
    if (phase !== "crafting" || craftStep !== "input") return;
    draftInputRef.current?.focus();
  }, [phase, craftStep, staging.length]);

  useEffect(() => {
    if (phase === "guessing") {
      guessARef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (!initialComparisonGameId) return;

    setComparisonGameId(initialComparisonGameId);
    setComparisonHighlightRunId(initialHighlightedRunId ?? null);
  }, [initialComparisonGameId, initialHighlightedRunId]);

  const shareUrl = game ? `${window.location.origin}?backwords=${game.id}` : "";
  const resultsShareUrl =
    game && run
      ? `${window.location.origin}?backwordsComparison=${game.id}&backwordsRun=${run.id}`
      : "";
  const resultsShareMessage =
    game && run ? buildBackwordsResultsShareMessage(run) : undefined;
  const lastAttempt = run?.attempts[run.attempts.length - 1] ?? null;
  const attemptsRemaining = run ? Math.max(0, 3 - run.attemptsUsed) : 3;

  function handleShare() {
    if (!game) return;
    setShowShareModal(true);
  }

  function handleCreateAnother() {
    reset();
    startBackwords();
  }

  function handleExit() {
    reset();
    onExit();
  }

  function handleAddStaging() {
    const text = draft.trim();
    if (!text) return;
    if (staging.length >= 5) return;
    if (text.length > 500) {
      setLocalError("Clues must be 500 characters or fewer.");
      return;
    }
    if (game?.topic && game.focus) {
      const leak = findTargetLeak(text, [game.topic, game.focus]);
      if (leak) {
        setLocalError(
          `Clues cannot include the hidden answer terms. Remove '${leak}'.`,
        );
        return;
      }
    }
    const normalized = normalizePhrase(text);
    if (
      staging.some((card) => normalizePhrase(card.text) === normalized)
    ) {
      setLocalError("You've already staged that pun.");
      return;
    }
    setLocalError(null);
    setStaging((prev) => [
      ...prev,
      { id: createCardId(), text, source: "human" },
    ]);
    setDraft("");
  }

  function handleRemoveStaging(id: string) {
    setStaging((prev) => prev.filter((card) => card.id !== id));
  }

  async function handleGenerateOptions() {
    if (!game || generating) return;
    setLocalError(null);
    setGenerating(true);

    const humanCards = staging.filter((card) => card.source === "human");
    try {
      const humanTexts = humanCards.map((card) => card.text);
      const generatedTexts =
        humanCards.length >= 5 ? [] : await generateClues(humanTexts);
      const aiCards: CraftCard[] = generatedTexts.map((text) => ({
        id: createCardId(),
        text,
        source: "ai",
      }));
      const combined = [...humanCards, ...aiCards].slice(0, 5);
      setSlots(combined);
      setStaging(combined);
      setCraftStep("curate");
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to generate clue options.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleRerollAi() {
    if (!game || generating) return;
    const humanCards = slots.filter((card) => card.source === "human");
    if (humanCards.length >= 5) return;
    setLocalError(null);
    setGenerating(true);
    try {
      const humanTexts = humanCards.map((card) => card.text);
      const generatedTexts = await generateClues(humanTexts);
      const aiCards: CraftCard[] = generatedTexts.map((text) => ({
        id: createCardId(),
        text,
        source: "ai",
      }));
      const humansInOrder = slots.filter((card) => card.source === "human");
      const combined = [...humansInOrder, ...aiCards].slice(0, 5);
      setSlots(combined);
      setStaging(combined);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to regenerate clues.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleBackToInput() {
    const humanCards = slots.filter((card) => card.source === "human");
    setStaging(humanCards);
    setSlots([]);
    setCraftStep("input");
    setLocalError(null);
  }

  function handleSlotDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    triggerHaptic(25);
    if (!over || active.id === over.id) return;
    setSlots((prev) => {
      const oldIndex = prev.findIndex((card) => card.id === active.id);
      const newIndex = prev.findIndex((card) => card.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handlePublish() {
    if (!game?.topic || !game.focus) return;
    if (slots.length < 3) {
      setLocalError("Select three clues before publishing.");
      return;
    }

    const active = slots.slice(0, 3);
    if (active.some((card) => !card.text.trim())) {
      setLocalError("Each active clue must have text.");
      return;
    }

    const normalized = active.map((card) => normalizePhrase(card.text));
    if (new Set(normalized).size !== 3) {
      setLocalError("Each clue pun must be distinct.");
      return;
    }

    for (const card of active) {
      const leak = findTargetLeak(card.text, [game.topic, game.focus]);
      if (leak) {
        setLocalError(
          `Clues cannot include the hidden answer terms. Remove '${leak}'.`,
        );
        return;
      }
    }

    setLocalError(null);
    const payload: BackwordsPublishClue[] = active.map((card) => ({
      pun_text: card.text.trim(),
      source: card.source,
    }));
    publishClues(payload);
  }

  function handleGuessSubmit() {
    const cleanGuessA = guessA.trim();
    const cleanGuessB = guessB.trim();

    if (!cleanGuessA || !cleanGuessB) {
      setLocalError("Enter both guessed concepts.");
      return;
    }

    if (normalizePhrase(cleanGuessA) === normalizePhrase(cleanGuessB)) {
      setLocalError("Submit two distinct concepts.");
      return;
    }

    setLocalError(null);
    submitGuess(cleanGuessA, cleanGuessB);
  }

  if (comparisonGameId) {
    return (
      <BackwordsComparison
        gameId={comparisonGameId}
        highlightRunId={
          comparisonHighlightRunId ?? (role === "guesser" ? run?.id : undefined)
        }
        onBack={() => {
          setComparisonGameId(null);
          setComparisonHighlightRunId(null);
        }}
      />
    );
  }

  if (phase === "complete" && game && role === "creator") {
    return (
      <>
        <CreatorReceipt
          game={game}
          onCreateAnother={handleCreateAnother}
          onExit={handleExit}
          onShare={handleShare}
          onViewComparison={() => {
            setComparisonGameId(game.id);
            setComparisonHighlightRunId(null);
          }}
        />
        {showShareModal && (
          <ShareModal
            title="Share This Backwords Puzzle"
            description="Send this link to challenge someone else to infer your hidden Topic and Focus from the clue puns."
            shareUrl={shareUrl}
            shareMessage="Try to crack my Backwords puzzle on PunIntended."
            onClose={() => setShowShareModal(false)}
          />
        )}
      </>
    );
  }

  if (phase === "complete" && game && role === "guesser" && run) {
    return (
      <>
        <GuesserReceipt
          game={game}
          run={run}
          onCreateAnother={handleCreateAnother}
          onExit={handleExit}
          onShare={handleShare}
          onViewComparison={() => {
            setComparisonGameId(game.id);
            setComparisonHighlightRunId(run.id);
          }}
        />
        {showShareModal && resultsShareUrl && (
          <ShareModal
            title="Share Your Backwords Results"
            description="Send this link to open the comparison view with your completed run highlighted, so the creator can see exactly how you did."
            shareUrl={resultsShareUrl}
            shareMessage={resultsShareMessage}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <motion.div
      key="backwords"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="mx-auto max-w-2xl"
    >
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <Card className="space-y-6 py-10 text-center">
              <div className="inline-flex rounded-2xl bg-orange-100 p-4 dark:bg-violet-900/30">
                <Brain className="h-10 w-10 text-orange-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400">
                  Reverse Mode
                </p>
                <h2 className="mb-3 text-4xl font-serif italic dark:text-zinc-100">
                  Backwords
                </h2>
                <p className="mx-auto max-w-md text-gray-500 dark:text-zinc-400">
                  Craft three clue puns from a hidden Topic and Focus, then let
                  other players reverse-engineer the pair in three guesses.
                </p>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button onClick={startBackwords} className="px-8">
                  Create a Puzzle
                </Button>
                <Button variant="ghost" onClick={onExit}>
                  Back
                </Button>
              </div>
            </Card>

            <BackwordsHistory
              onViewComparison={(gameId) => setComparisonGameId(gameId)}
            />
          </motion.div>
        )}

        {phase === "assigning" && (
          <motion.div
            key="assigning"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="space-y-6 py-16 text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="inline-flex rounded-2xl bg-orange-100 p-4 dark:bg-violet-900/30"
              >
                <Sparkles className="h-10 w-10 text-orange-600 dark:text-violet-400" />
              </motion.div>
              <p className="text-xl font-serif italic dark:text-zinc-100">
                Assigning your hidden pair...
              </p>
            </Card>
          </motion.div>
        )}

        {phase === "crafting" && role === "creator" && game && (
          <motion.div
            key="crafting"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              <div className="relative overflow-hidden rounded-2xl bg-zinc-900 p-5 text-white sm:rounded-[2rem] dark:bg-zinc-800">
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-orange-400 dark:text-violet-300">
                  Topic
                </p>
                <h2 className="text-2xl font-serif italic">{game.topic}</h2>
              </div>
              <div className="relative overflow-hidden rounded-2xl bg-orange-500 p-5 text-white sm:rounded-[2rem] dark:bg-violet-600">
                <p className="mb-2 font-mono text-xs uppercase tracking-widest text-white/70">
                  Focus
                </p>
                <h2 className="text-2xl font-serif italic">{game.focus}</h2>
              </div>
            </div>

            {craftStep === "input" && (
              <Card className="space-y-4 border-2 border-orange-100 dark:border-violet-900/50">
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                    Write Your Puns
                  </p>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    Add as many as you like (1–5). The AI will fill the rest.
                    Each must bridge both concepts without saying the hidden
                    answer words.
                  </p>
                </div>

                {staging.length < 5 && (
                  <div className="flex items-stretch gap-2">
                    <input
                      ref={draftInputRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddStaging();
                        }
                      }}
                      maxLength={500}
                      placeholder="Write a clue pun..."
                      className="flex-1 rounded-xl border-none bg-gray-50 p-4 font-serif text-lg italic text-gray-900 focus:ring-2 focus:ring-orange-500 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-violet-500"
                    />
                    <Button
                      onClick={handleAddStaging}
                      variant="secondary"
                      disabled={!draft.trim()}
                    >
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                )}

                {staging.length > 0 && (
                  <div className="space-y-2">
                    {staging.map((card) => (
                      <div
                        key={card.id}
                        className="flex items-start gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950"
                      >
                        <p className="flex-1 font-serif italic text-zinc-800 dark:text-zinc-200">
                          {card.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleRemoveStaging(card.id)}
                          className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                          aria-label="Remove pun"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {(localError || error) && (
                  <p className="text-sm text-red-500">{localError ?? error}</p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
                    <EyeOff className="h-3.5 w-3.5" />
                    Don't say the hidden words directly.
                  </div>
                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={handleExit}>
                      Back
                    </Button>
                    <Button
                      onClick={handleGenerateOptions}
                      loading={generating}
                      disabled={staging.length === 0}
                    >
                      <Wand2 className="h-4 w-4" />
                      {staging.length >= 5 ? "Proceed" : "Generate Options"}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {craftStep === "curate" && (
              <Card className="space-y-4 border-2 border-orange-100 dark:border-violet-900/50">
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                    Rank Your Clues
                  </p>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    Drag to reorder. The top three become your puzzle, revealed
                    to the guesser in order — vague first, obvious last.
                  </p>
                </div>

                <CurateSlots
                  slots={slots}
                  onDragEnd={handleSlotDragEnd}
                  onDragStart={() => triggerHaptic(15)}
                />

                {(localError || error) && (
                  <p className="text-sm text-red-500">{localError ?? error}</p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <Button
                    variant="ghost"
                    onClick={handleBackToInput}
                    disabled={submitting || generating}
                  >
                    Back
                  </Button>
                  <div className="flex gap-3">
                    {slots.some((card) => card.source === "ai") && (
                      <Button
                        variant="outline"
                        onClick={handleRerollAi}
                        loading={generating}
                        disabled={submitting}
                      >
                        <RefreshCcw className="h-4 w-4" /> Reroll AI
                      </Button>
                    )}
                    <Button
                      onClick={handlePublish}
                      loading={submitting}
                      disabled={generating}
                    >
                      Publish Puzzle <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {phase === "publishing" && role === "creator" && game && (
          <motion.div
            key="publishing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            <Card className="space-y-6 py-12 text-center">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.8,
                  ease: "easeInOut",
                }}
                className="inline-flex rounded-2xl bg-orange-100 p-4 dark:bg-violet-900/30"
              >
                <Sparkles className="h-10 w-10 text-orange-600 dark:text-violet-400" />
              </motion.div>
              <div>
                <h2 className="text-2xl font-serif italic dark:text-zinc-100">
                  Scoring your clue set...
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                  Share the puzzle now if you like. The AI is grading how well
                  your clues bridge the hidden pair.
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button onClick={handleShare} variant="secondary">
                  <Share2 className="h-4 w-4" /> Share Puzzle
                </Button>
                <Button
                  onClick={() => setComparisonGameId(game.id)}
                  variant="outline"
                >
                  <Search className="h-4 w-4" /> View Results
                </Button>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              {game.clues.map((clue, index) => (
                <Card key={`${clue.pun_text}-${index}`} className="space-y-2">
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                    Clue {index + 1}
                  </p>
                  <p className="font-serif italic text-zinc-800 dark:text-zinc-200">
                    “{clue.pun_text}”
                  </p>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "guessing" && role === "guesser" && game && run && (
          <motion.div
            key="guessing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400">
                    Deduction Phase
                  </p>
                  <h2 className="mt-1 text-2xl font-serif italic dark:text-zinc-100">
                    Decode The Pair
                  </h2>
                </div>
                <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {attemptsRemaining} guess{attemptsRemaining === 1 ? "" : "es"}{" "}
                  left
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {game.clues.map((clue, index) => {
                  const hasSourceMetadata = game.clues.some(
                    (c) => c.source !== undefined,
                  );
                  const revealedCount = hasSourceMetadata
                    ? Math.min(game.clues.length, run.attemptsUsed + 1)
                    : game.clues.length;
                  const revealed = index < revealedCount;
                  return (
                    <div
                      key={`${clue.pun_text}-${index}`}
                      className={`rounded-2xl border p-4 ${
                        revealed
                          ? "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                          : "border-dashed border-zinc-200 bg-white/40 dark:border-zinc-800 dark:bg-zinc-900/40"
                      }`}
                    >
                      <p className="font-mono text-[11px] uppercase tracking-widest text-orange-500 dark:text-violet-400">
                        Clue {index + 1}
                      </p>
                      {revealed ? (
                        <p className="mt-2 font-serif italic text-zinc-800 dark:text-zinc-200">
                          “{clue.pun_text}”
                        </p>
                      ) : (
                        <p className="mt-2 flex items-center gap-1.5 text-sm italic text-gray-400 dark:text-zinc-500">
                          <Lock className="h-3.5 w-3.5" />
                          Unlocks after your next guess
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {lastAttempt && !lastAttempt.matched && lastAttempt.feedback && (
              <Card className="space-y-3 border border-orange-200 bg-orange-50/60 dark:border-violet-900/60 dark:bg-violet-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <Target className="h-4 w-4 text-orange-500 dark:text-violet-400" />
                  Previous Attempt Feedback
                </div>
                <p className="text-sm italic text-gray-600 dark:text-zinc-400">
                  {lastAttempt.feedback}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] font-mono text-gray-500 dark:text-zinc-500">
                  <span className="rounded-full bg-white px-3 py-1 dark:bg-zinc-900">
                    Topic {lastAttempt.topic_similarity ?? 0}%
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 dark:bg-zinc-900">
                    Focus {lastAttempt.focus_similarity ?? 0}%
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 dark:bg-zinc-900">
                    Overall {lastAttempt.overall_similarity ?? 0}%
                  </span>
                </div>
              </Card>
            )}

            <Card className="space-y-4 border-2 border-orange-100 dark:border-violet-900/50">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                  Submit Two Concepts
                </p>
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  Order does not matter. The AI will map your two concepts to
                  Topic and Focus automatically.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  ref={guessARef}
                  value={guessA}
                  onChange={(event) => setGuessA(event.target.value)}
                  maxLength={120}
                  placeholder="Concept A"
                  className="w-full rounded-xl border-none bg-gray-50 px-4 py-4 text-lg font-medium text-gray-900 focus:ring-2 focus:ring-orange-500 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-violet-500"
                />
                <input
                  value={guessB}
                  onChange={(event) => setGuessB(event.target.value)}
                  maxLength={120}
                  placeholder="Concept B"
                  className="w-full rounded-xl border-none bg-gray-50 px-4 py-4 text-lg font-medium text-gray-900 focus:ring-2 focus:ring-orange-500 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-violet-500"
                />
              </div>

              {(localError || error) && (
                <p className="text-sm text-red-500">{localError ?? error}</p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
                  <EyeOff className="h-3.5 w-3.5" />
                  The hidden pair stays locked until the run resolves.
                </div>
                <Button
                  onClick={handleGuessSubmit}
                  loading={submitting}
                  disabled={submitting}
                >
                  Submit Guess <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {phase === "judging" && role === "guesser" && run && (
          <motion.div
            key="judging"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="space-y-6 py-16 text-center">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.8,
                  ease: "easeInOut",
                }}
                className="inline-flex rounded-2xl bg-orange-100 p-4 dark:bg-violet-900/30"
              >
                <Search className="h-10 w-10 text-orange-600 dark:text-violet-400" />
              </motion.div>
              <div>
                <h2 className="text-2xl font-serif italic dark:text-zinc-100">
                  Comparing your guess...
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                  The AI is testing both concept mappings against the hidden
                  pair.
                </p>
              </div>
              {lastAttempt && (
                <div className="mx-auto max-w-md rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-left dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                    Submitted Guess
                  </p>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    A: {lastAttempt.guess_a}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    B: {lastAttempt.guess_b}
                  </p>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {showShareModal && game && (
        <ShareModal
          title="Share This Backwords Puzzle"
          description="Send this link to challenge someone else to infer the hidden Topic and Focus from the clue puns."
          shareUrl={shareUrl}
          shareMessage="Try to crack this Backwords puzzle on PunIntended."
          onClose={() => setShowShareModal(false)}
        />
      )}
    </motion.div>
  );
}
