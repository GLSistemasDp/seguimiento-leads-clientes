"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  ayuda?: ReactNode;
  error?: string;
};

export function Input({ label, ayuda, error, className = "", id, ...props }: InputProps) {
  const generado = useId();
  const inputId = id ?? generado;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`rounded-md border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 ${
          error ? "border-red-400" : "border-slate-300"
        } ${className}`}
        {...props}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!error && ayuda ? <p className="text-xs text-slate-500">{ayuda}</p> : null}
    </div>
  );
}
