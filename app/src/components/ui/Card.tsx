import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-4 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
