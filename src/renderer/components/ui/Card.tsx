import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  padding?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className = '',
  variant = 'default',
  padding = true,
  onClick
}: CardProps) {
  const variants = {
    default: 'card',
    danger: 'card border-2 border-red-500 bg-red-500/5',
    warning: 'card border-2 border-yellow-500 bg-yellow-500/5',
    success: 'card border-2 border-green-500 bg-green-500/5',
    info: 'card border-2 border-blue-500 bg-blue-500/5',
  };

  const paddingClass = padding ? 'p-6' : '';
  const cursorClass = onClick ? 'cursor-pointer hover:border-slate-600 transition-all' : '';

  return (
    <div
      className={`${variants[variant]} ${paddingClass} ${cursorClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
