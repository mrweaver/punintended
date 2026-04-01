import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Copy, Check, Share2 } from "lucide-react";
import QRCode from "react-qr-code";
import { Button } from "../ui/Button";

interface ShareModalProps {
  title: string;
  description: ReactNode;
  shareUrl: string;
  shareMessage?: string;
  onClose: () => void;
}

export function ShareModal({
  title,
  description,
  shareUrl,
  shareMessage,
  onClose,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareNatively = async () => {
    if (!canNativeShare) return;

    setSharing(true);
    try {
      await navigator.share({
        title,
        text: shareMessage,
        url: shareUrl,
      });
    } catch {
      // Ignore cancellation and let copy-link remain the reliable fallback.
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full text-center relative shadow-2xl border border-gray-100 dark:border-zinc-800"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white p-2"
        >
          ✕
        </button>
        <h3
          id="share-modal-title"
          className="text-2xl font-serif italic mb-6 dark:text-zinc-100"
        >
          {title}
        </h3>
        <div className="bg-white p-4 rounded-xl inline-block mb-6 border border-gray-100 dark:border-zinc-800 shadow-sm">
          <QRCode value={shareUrl} size={200} />
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
          {description}
        </p>
        {canNativeShare && (
          <Button
            onClick={shareNatively}
            variant="outline"
            className="w-full mb-3"
            disabled={sharing}
          >
            <Share2 className="w-4 h-4" />
            {sharing ? "Opening share sheet…" : "Share"}
          </Button>
        )}
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-950 p-2 rounded-xl border border-gray-200 dark:border-zinc-800">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="bg-transparent flex-1 outline-none text-sm px-2 text-gray-600 dark:text-zinc-300"
          />
          <Button
            onClick={copyLink}
            className="px-4 py-2 text-sm whitespace-nowrap"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
