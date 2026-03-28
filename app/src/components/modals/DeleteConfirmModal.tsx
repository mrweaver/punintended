import { motion } from 'motion/react';
import { Button } from '../ui/Button';

interface DeleteConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full text-center relative shadow-2xl border border-gray-100 dark:border-zinc-800"
      >
        <h3 className="text-2xl font-serif italic mb-4 dark:text-zinc-100">Delete Session?</h3>
        <p className="text-gray-600 dark:text-zinc-400 mb-8">
          Are you sure you want to delete this session? This action cannot be undone.
        </p>
        <div className="flex gap-4">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className="flex-1 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 border-none text-white"
          >
            Delete
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
