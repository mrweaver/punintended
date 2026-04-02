import React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface rounded-2xl sm:rounded-3xl shadow-sm border border-border p-4 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
