import { ICONS, IconName } from '../icons';

interface NavButtonProps {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: number;
  badgeColor?: 'blue' | 'red';
  onClick: () => void;
}

export function NavButton({
  icon,
  label,
  active,
  badge,
  badgeColor = 'blue',
  onClick
}: NavButtonProps) {
  const IconComponent = ICONS[icon];

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
        active
          ? 'bg-primary-600 text-white'
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
      }`}
    >
      <IconComponent className="w-5 h-5" />
      <span className="flex-1 text-left text-sm font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`px-2 py-0.5 text-xs font-bold rounded-full ${
            badgeColor === 'red' ? 'bg-red-500 text-white' : 'bg-primary-500 text-white'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
