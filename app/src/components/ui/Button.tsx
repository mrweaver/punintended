import React from "react";
import { RefreshCw } from "lucide-react";

const variants = {
  primary:
    "bg-text text-surface hover:bg-text/90 dark:bg-accent dark:hover:bg-accent-hover dark:text-white",
  secondary:
    "bg-accent text-text hover:bg-accent-hover dark:bg-accent-hover dark:text-white dark:hover:bg-accent",
  outline:
    "border border-text text-text hover:bg-surface-muted dark:border-text dark:text-text dark:hover:bg-surface-muted",
  ghost: "text-text-secondary hover:bg-surface-muted",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 sm:px-6 sm:py-3",
};

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  loading = false,
  type = "button",
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
