import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Logo({ size = 'md', className }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-xl',
  };

  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Gradient Definitions */}
        <defs>
          <linearGradient id="wazzi-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#8B5CF6', stopOpacity: 1 }} /> {/* Purple */}
            <stop offset="100%" style={{ stopColor: '#F97316', stopOpacity: 1 }} /> {/* Orange */}
          </linearGradient>
        </defs>

        {/* Circle Background */}
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="url(#wazzi-gradient)"
          className="drop-shadow-lg"
        />

        {/* Letter W */}
        <text
          x="50"
          y="50"
          dominantBaseline="central"
          textAnchor="middle"
          fill="white"
          fontWeight="bold"
          fontSize="52"
          fontFamily="system-ui, -apple-system, sans-serif"
          className="select-none"
        >
          W
        </text>
      </svg>
    </div>
  );
}

export function LogoWithText({ size = 'md', className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Logo size={size} />
      <span className="text-lg font-semibold">Wazzi</span>
    </div>
  );
}
