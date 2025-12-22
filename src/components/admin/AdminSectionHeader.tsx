import React from 'react';

interface AdminSectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function AdminSectionHeader({ title, subtitle, className = '' }: AdminSectionHeaderProps) {
  return (
    <div className={`mb-6 text-center ${className}`}>
      <h2 className="text-2xl md:text-3xl font-semibold tracking-[0.15em] uppercase text-slate-900">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm md:text-base text-slate-600">
          {subtitle}
        </p>
      )}
    </div>
  );
}
