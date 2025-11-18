interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'warning' | 'error' | 'success' | 'pending';
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({
  status,
  label,
  pulse = false,
  size = 'md'
}: StatusBadgeProps) {
  const statusConfig = {
    active: { bg: 'bg-green-500', text: label || 'Active' },
    inactive: { bg: 'bg-slate-500', text: label || 'Inactive' },
    warning: { bg: 'bg-yellow-500', text: label || 'Warning' },
    error: { bg: 'bg-red-500', text: label || 'Error' },
    success: { bg: 'bg-green-500', text: label || 'Success' },
    pending: { bg: 'bg-blue-500', text: label || 'Pending' },
  };

  const sizeClasses = {
    sm: { dot: 'w-1.5 h-1.5', text: 'text-[10px]' },
    md: { dot: 'w-2 h-2', text: 'text-xs' },
    lg: { dot: 'w-3 h-3', text: 'text-sm' },
  };

  const { bg, text } = statusConfig[status];
  const { dot, text: textSize } = sizeClasses[size];

  return (
    <div className="flex items-center gap-2">
      <div className={`${dot} rounded-full ${bg} ${pulse ? 'animate-pulse' : ''}`} />
      <span className={`${textSize} text-slate-300`}>{text}</span>
    </div>
  );
}
