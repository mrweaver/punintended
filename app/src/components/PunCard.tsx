import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, ChevronDown, Pencil, Trash2, Send } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/Button";
import { GroanBadge } from "./ui/GroanBadge";
import { Logo } from "./ui/Logo";
import { useLongPress } from "../hooks/useLongPress";
import { formatFuzzyTime } from '../utils/time';
import {
  ReactionPicker,
  ReactionSummary,
  type MessageReaction,
} from "./ReactionPicker";
import type { Pun, PunComment, PunReaction } from "../api/client";

interface PunCardProps {
  pun: Pun;
  index: number;
  comments: PunComment[];
  submitting: boolean;
  hideAuthor?: boolean;
  disableComments?: boolean;
  onReact: (punId: string, reaction: PunReaction | null) => void;
  onViewed: (punId: string) => void;
  onEdit: (punId: string, text: string) => void;
  onDelete: (punId: string) => void;
  onComment: (punId: string, text: string) => void;
  onCommentReact?: (commentId: string, reaction: string | null) => void;
  onLoadComments?: (punId: string) => void;
}

function CommentBubble({
  comment,
  onReact,
}: {
  comment: PunComment;
  onReact?: (commentId: string, reaction: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const longPressHandlers = useLongPress({
    onLongPress: useCallback(() => setPickerOpen(true), []),
  });

  return (
    <div className="flex gap-3">
      <img
        src={comment.userPhoto || ""}
        alt={comment.userName}
        className="w-6 h-6 rounded-full border border-border-strong shrink-0"
      />
      <div className="flex-1 min-w-0 relative">
        <div
          {...longPressHandlers}
          className="bg-surface-muted rounded-2xl rounded-tl-sm px-4 py-2 select-none"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-text">
              {comment.userName}
            </span>
            <span className="text-[10px] text-text-muted">
              {new Date(comment.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-sm text-text-secondary">{comment.text}</p>
        </div>
        <ReactionSummary reactions={comment.reactions ?? {}} />
        <AnimatePresence>
          {pickerOpen && (
            <ReactionPicker
              currentReaction={comment.myReaction ?? null}
              onSelect={(reaction: MessageReaction | null) => {
                onReact?.(comment.id, reaction);
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PunCard({
  pun,
  index,
  comments,
  submitting,
  hideAuthor = false,
  disableComments = false,
  onReact,
  onViewed,
  onEdit,
  onDelete,
  onComment,
  onCommentReact,
  onLoadComments,
}: PunCardProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [showNewBadge, setShowNewBadge] = useState(!pun.viewed);
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync if pun becomes unviewed again (e.g. new data)
  useEffect(() => {
    if (!pun.viewed && !showNewBadge) setShowNewBadge(true);
    return () => clearTimeout(badgeTimerRef.current);
  }, [pun.viewed]);

  const isAuthor = pun.authorId === user?.uid;

  const handleSubmitComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onComment(pun.id, commentText.trim());
    setCommentText("");
    onViewed(pun.id);
  };

  const handleGroan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAuthor) return; // Prevent authors from groaning at their own puns
    onReact(pun.id, pun.myReaction ? null : "groan");
    onViewed(pun.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onViewportEnter={() => {
        if (!pun.viewed) {
          onViewed(pun.id);
          badgeTimerRef.current = setTimeout(() => setShowNewBadge(false), 1200);
        }
      }}
      viewport={{ once: true, amount: 0.3 }}
      className="bg-surface p-4 rounded-2xl shadow-sm border border-border flex flex-col gap-3"
    >
      {/* ── Header: Metadata & Actions ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {!hideAuthor && (
          <>
            <span className="font-bold text-text truncate max-w-[120px] sm:max-w-none">
              {pun.authorName}
            </span>
            <span className="text-xs text-text-muted whitespace-nowrap">
              •{" "}
            </span>
          </>
        )}
        <span className="text-xs text-text-muted whitespace-nowrap">
          {new Date(pun.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {pun.responseTimeMs != null && (
          <span className="text-xs text-text-muted whitespace-nowrap">
            • {formatFuzzyTime(pun.responseTimeMs)}
          </span>
        )}
        <AnimatePresence>
          {showNewBadge && (
            <motion.span
              initial={{ scale: 1, opacity: 1 }}
              exit={{
                scale: [1.3, 0],
                opacity: [1, 0],
                filter: ["blur(0px)", "blur(4px)"],
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-warning-subtle text-warning"
            >
              New
            </motion.span>
          )}
        </AnimatePresence>

        {/* Spacer pushes the actions to the right */}
        <div className="flex-1" />

        {/* ── Right Aligned Actions (Never Shuffles) ── */}
        <div className="flex items-center gap-3">
          {/* Groan Interaction */}
          <div className="flex items-center gap-1.5">
            <motion.button
              whileTap={isAuthor ? undefined : { scale: 0.9 }}
              onClick={handleGroan}
              disabled={isAuthor}
              aria-label={
                isAuthor
                  ? "You can't groan at your own pun"
                  : pun.myReaction
                    ? "Remove groan reaction"
                    : "Groan at this pun"
              }
              title={
                isAuthor
                  ? "You can't groan at your own pun!"
                  : "The highest compliment for a good pun!"
              }
              className={`group flex items-center text-sm transition-all disabled:cursor-default ${
                pun.myReaction
                  ? "text-accent-foreground opacity-100"
                  : `disabled:opacity-50 ${
                      pun.groanCount > 0
                        ? "text-text-secondary opacity-100"
                        : "text-text-muted opacity-80"
                    } ${!isAuthor && "hover:text-text"}`
              }`}
            >
              <span
                className={`text-base transition-all duration-200 ${
                  pun.myReaction || pun.groanCount > 0
                    ? ""
                    : `grayscale ${!isAuthor ? "group-hover:grayscale-0" : ""}`
                }`}
              >
                🙄
              </span>
            </motion.button>

            {pun.groanCount > 0 && (
              <motion.div
                key={pun.groanCount}
                initial={{ scale: 0.5, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 12 }}
              >
                <GroanBadge
                  count={pun.groanCount}
                  groaners={pun.groaners}
                  showIcon={false}
                  triggerClassName={`inline-flex items-center rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${
                    pun.myReaction
                      ? "font-medium text-accent-foreground"
                      : "font-medium text-text-secondary hover:text-text"
                  }`}
                />
              </motion.div>
            )}
          </div>

          {/* Edit/Delete Actions */}
          {isAuthor && !isEditing && (
            <div className="flex items-center gap-1 border-l border-border pl-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setEditText(pun.text);
                }}
                className="p-1.5 text-text-muted hover:text-accent hover:bg-accent-subtle rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(pun.id);
                }}
                className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-subtle rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Pun text ── */}
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full p-3 sm:p-4 text-lg font-serif italic bg-surface-muted text-text rounded-xl border border-border-strong focus:ring-2 focus:ring-accent-ring min-h-[80px] resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(false);
              }}
              className="px-3 py-1.5 text-sm"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(pun.id, editText);
                setIsEditing(false);
              }}
              className="px-3 py-1.5 text-sm"
              loading={submitting}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xl sm:text-2xl font-serif italic text-text">
          "{pun.text}"
        </p>
      )}

      {/* ── AI feedback ── */}
      {pun.aiScore !== undefined && pun.aiScore !== null && !isEditing && (
        <div className="flex items-start gap-3 p-3 bg-accent-subtle rounded-xl">
          <Logo className="w-4 h-4 text-accent shrink-0 mt-0.5" accent />
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold text-accent-foreground">
                AI Score: {pun.aiScore}/10
              </span>
            </div>
            <p className="text-xs sm:text-sm text-accent italic">
              {pun.aiFeedback}
            </p>
          </div>
        </div>
      )}

      {pun.aiFeedback === "Re-evaluating..." && !isEditing && (
        <div className="flex items-start gap-3 p-3 bg-accent-subtle rounded-xl">
          <Logo
            className="w-4 h-4 text-accent shrink-0 mt-0.5 animate-spin"
            accent
          />
          <p className="text-xs sm:text-sm text-accent italic">
            Re-evaluating...
          </p>
        </div>
      )}

      {/* ── Comments Toggle (Only renders if allowed) ── */}
      {!disableComments && (
        <div className="flex items-center pt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isExpanded) onLoadComments?.(pun.id);
              setIsExpanded(!isExpanded);
              onViewed(pun.id);
            }}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              isExpanded
                ? "text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <MessageCircle
              className={`w-4 h-4 ${isExpanded ? "fill-current" : ""}`}
            />
            <span className="font-medium text-xs">
              {comments.length > 0 ? comments.length : "Discuss"}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      )}

      {/* ── Comments Section ── */}
      {!disableComments && (
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-border pt-3 mt-2"
            >
              <div className="space-y-3 mb-3">
                {comments.length === 0 ? (
                  <p className="text-sm text-text-muted italic text-center py-2">
                    No comments yet. Be the first!
                  </p>
                ) : (
                  comments.map((comment) => (
                    <CommentBubble
                      key={comment.id}
                      comment={comment}
                      onReact={onCommentReact}
                    />
                  ))
                )}
              </div>
              <form onSubmit={handleSubmitComment} className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-transparent border-b border-border-strong text-text px-2 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <Button
                  variant="ghost"
                  type="submit"
                  className="p-2 rounded-full min-w-[36px] h-[36px] flex items-center justify-center text-accent hover:bg-accent-subtle"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}
