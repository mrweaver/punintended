import React from 'react';
import { RefreshCw } from 'lucide-react';

const variants = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-violet-600 dark:hover:bg-violet-500',
  secondary:
    'bg-amber-500 text-zinc-950 hover:bg-amber-400 dark:bg-violet-500 dark:text-white dark:hover:bg-violet-400',
  outline:
    'border border-zinc-900 text-zinc-900 hover:bg-zinc-50 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 sm:px-6 sm:py-3',
};

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  loading = false,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${sizes[size]} rounded-full font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
