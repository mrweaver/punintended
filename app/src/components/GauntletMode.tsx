import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Swords } from "lucide-react";
import { useGauntlet } from "../hooks/useGauntlet";
import { GauntletReceipt } from "./GauntletReceipt";
import { GauntletComparison } from "./GauntletComparison";
import { GauntletHistory } from "./GauntletHistory";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface GauntletModeProps {
  initialGauntletId?: string;
  onExit: () => void;
}

const ROUND_SECONDS = 60;

function CountdownRing({ secondsRemaining }: { secondsRemaining: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsRemaining / ROUND_SECONDS;
  const dashOffset = circumference * (1 - progress);

  const strokeColor =
    secondsRemaining > 30
      ? "#22c55e" // green-500
      : secondsRemaining > 15
        ? "#f97316" // orange-500
        : "#ef4444"; // red-500

  return (
    <div className="relative flex items-center justify-center w-32 h-32 mx-auto">
      <svg className="absolute inset-0 -rotate-90" width="128" height="128">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-zinc-200 dark:text-zinc-700"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.5s linear, stroke 0.5s" }}
        />
      </svg>
      <span
        className="text-3xl font-mono font-bold tabular-nums z-10"
        style={{ color: strokeColor }}
      >
        {secondsRemaining}
      </span>
    </div>
  );
}

export function GauntletMode({ initialGauntletId, onExit }: GauntletModeProps) {
  const {
    phase,
    gauntletId,
    runId,
    rounds,
    currentRoundIndex,
    submitting,
    runData,
    error,
    startGauntlet,
    submitRound,
    timerExpired,
    reset,
  } = useGauntlet(initialGauntletId);

  const [comparisonGauntletId, setComparisonGauntletId] = useState<string | null>(null);

  const [punText, setPunText] = useState("");
  const [localSeconds, setLocalSeconds] = useState(ROUND_SECONDS);
  const startTimeRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Timer — absolute timestamps, immune to tab throttling
  useEffect(() => {
    if (phase !== "playing") return;
    setPunText("");
    setLocalSeconds(ROUND_SECONDS);
    startTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - (startTimeRef.current ?? Date.now())) / 1000,
      );
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      setLocalSeconds(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        timerExpired();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [phase, currentRoundIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === "playing") {
      textareaRef.current?.focus();
    }
  }, [phase, currentRoundIndex]);

  function handleSubmit() {
    if (submitting) return;
    submitRound(punText.trim(), localSeconds);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  if (comparisonGauntletId) {
    return (
      <GauntletComparison
        gauntletId={comparisonGauntletId}
        onBack={() => setComparisonGauntletId(null)}
      />
    );
  }

  if (phase === "complete" && runData && gauntletId) {
    return (
      <GauntletReceipt
        run={runData}
        gauntletId={gauntletId}
        rounds={rounds}
        onViewComparison={() => setComparisonGauntletId(gauntletId)}
        onPlayAgain={() => {
          reset();
          startGauntlet();
        }}
        onExit={() => {
          reset();
          onExit();
        }}
      />
    );
  }

  return (
    <motion.div
      key="gauntlet"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="max-w-2xl mx-auto"
    >
      <AnimatePresence mode="wait">
        {/* Idle */}
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <Card className="text-center space-y-6 py-10">
              <div className="inline-flex p-4 rounded-2xl bg-orange-100 dark:bg-violet-900/30">
                <Swords className="w-10 h-10 text-orange-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400 mb-2">
                  Solo Mode
                </p>
                <h2 className="text-4xl font-serif italic mb-3 dark:text-zinc-100">
                  The Gauntlet
                </h2>
                <p className="text-gray-500 dark:text-zinc-400 max-w-sm mx-auto">
                  5 rounds. 60 seconds each. AI-judged with a quality-gated
                  speed bonus. Survive all 5 to claim your score.
                </p>
              </div>
              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={startGauntlet} className="px-8">
                  Start The Gauntlet
                </Button>
                <Button variant="ghost" onClick={onExit}>
                  Back
                </Button>
              </div>
            </Card>

            <GauntletHistory
              onViewComparison={(id) => setComparisonGauntletId(id)}
            />
          </motion.div>
        )}

        {/* Generating */}
        {phase === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="text-center space-y-6 py-16">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="inline-flex p-4 rounded-2xl bg-orange-100 dark:bg-violet-900/30"
              >
                <Swords className="w-10 h-10 text-orange-600 dark:text-violet-400" />
              </motion.div>
              <p className="text-xl font-serif italic dark:text-zinc-100">
                Generating your challenges...
              </p>
            </Card>
          </motion.div>
        )}

        {/* Playing */}
        {phase === "playing" && rounds[currentRoundIndex] && (
          <motion.div
            key={`round-${currentRoundIndex}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="space-y-5"
          >
            {/* Round header */}
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                Round {currentRoundIndex + 1} of 5
              </p>
              <div className="flex gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < currentRoundIndex
                        ? "bg-orange-500 dark:bg-violet-500"
                        : i === currentRoundIndex
                          ? "bg-orange-500 dark:bg-violet-500 ring-2 ring-orange-300 dark:ring-violet-400"
                          : "bg-zinc-200 dark:bg-zinc-700"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Countdown */}
            <CountdownRing secondsRemaining={localSeconds} />

            {/* Topic + Focus cards — same style as GameBoard */}
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-zinc-900 dark:bg-zinc-800 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] relative overflow-hidden">
                <p className="text-orange-400 dark:text-violet-300 font-mono text-xs uppercase tracking-widest mb-2">
                  Topic
                </p>
                <h2 className="text-xl sm:text-3xl font-serif italic">
                  {rounds[currentRoundIndex].topic}
                </h2>
              </div>
              <div className="bg-orange-500 dark:bg-violet-600 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] relative overflow-hidden">
                <p className="text-white/60 font-mono text-xs uppercase tracking-widest mb-2">
                  Focus
                </p>
                <h2 className="text-xl sm:text-3xl font-serif italic">
                  {rounds[currentRoundIndex].focus}
                </h2>
              </div>
            </div>

            {/* Pun input */}
            <Card className="border-2 border-orange-100 dark:border-violet-900/50 space-y-3">
              <textarea
                ref={textareaRef}
                value={punText}
                onChange={(e) => setPunText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your pun here..."
                maxLength={500}
                className="w-full p-4 text-lg font-serif italic bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 rounded-xl border-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 min-h-[100px] resize-none"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400 dark:text-zinc-500">
                  Ctrl+Enter to submit
                </span>
                <Button
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={submitting}
                  className="gap-2"
                >
                  {currentRoundIndex < 4 ? (
                    <>
                      Submit & Next <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    "Submit Final Round"
                  )}
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Deliberating */}
        {phase === "deliberating" && (
          <motion.div
            key="deliberating"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="text-center space-y-6 py-16">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                className="inline-flex p-4 rounded-2xl bg-orange-100 dark:bg-violet-900/30"
              >
                <Swords className="w-10 h-10 text-orange-600 dark:text-violet-400" />
              </motion.div>
              <div>
                <h2 className="text-2xl font-serif italic mb-2 dark:text-zinc-100">
                  The judges are deliberating...
                </h2>
                <p className="text-gray-500 dark:text-zinc-400 text-sm">
                  Hang tight while the AI reviews your puns.
                </p>
              </div>
              <div className="flex justify-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.2,
                      delay: i * 0.4,
                    }}
                    className="w-2 h-2 rounded-full bg-orange-500 dark:bg-violet-500"
                  />
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
