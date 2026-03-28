import { useState } from 'react';
import { motion } from 'motion/react';
import { Copy, Check } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../ui/Button';
import type { Session } from '../../api/client';

interface ShareModalProps {
  session: Session;
  onClose: () => void;
}

export function ShareModal({ session, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}?session=${session.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full text-center relative shadow-2xl border border-gray-100 dark:border-zinc-800"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white p-2"
        >
          ✕
        </button>
        <h3 id="share-modal-title" className="text-2xl font-serif italic mb-6 dark:text-zinc-100">
          Invite Friends
        </h3>
        <div className="bg-white p-4 rounded-xl inline-block mb-6 border border-gray-100 dark:border-zinc-800 shadow-sm">
          <QRCode value={shareUrl} size={200} />
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
          Scan the QR code or share the link below to invite players to{' '}
          <strong className="dark:text-zinc-200">{session.name}</strong>.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-950 p-2 rounded-xl border border-gray-200 dark:border-zinc-800">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="bg-transparent flex-1 outline-none text-sm px-2 text-gray-600 dark:text-zinc-300"
          />
          <Button onClick={copyLink} className="px-4 py-2 text-sm whitespace-nowrap">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
