import { ReactNode } from 'react';
import { Card } from './Card';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'yellow';
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  color = 'blue',
  trend,
  className = ''
}: MetricCardProps) {
  const colorClasses = {
    blue: 'border-blue-500 bg-blue-500/10',
    green: 'border-green-500 bg-green-500/10',
    purple: 'border-purple-500 bg-purple-500/10',
    orange: 'border-orange-500 bg-orange-500/10',
    red: 'border-red-500 bg-red-500/10',
    yellow: 'border-yellow-500 bg-yellow-500/10',
  };

  const textColorClasses = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
  };

  return (
    <Card className={`${colorClasses[color]} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-slate-300 mb-1">{title}</div>
          <div className={`text-4xl font-bold ${textColorClasses[color]} mb-1`}>
            {value}
          </div>
          {subtitle && (
            <div className="text-xs text-slate-400">{subtitle}</div>
          )}
        </div>
        {icon && (
          <div className={`ml-4 ${textColorClasses[color]}`}>
            {icon}
          </div>
        )}
        {trend && (
          <div className={`ml-4 text-sm font-semibold ${
            trend.direction === 'up' ? 'text-green-400' : 'text-red-400'
          }`}>
            <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
            <span className="ml-1">{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
    </Card>
  );
}
