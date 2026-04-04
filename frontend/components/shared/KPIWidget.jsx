import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KPIWidget({ 
  icon: Icon, 
  title, 
  value, 
  trend = 'neutral', 
  trendValue, 
  sparklineData 
}) {
  const isUp = trend === 'up';
  const isDown = trend === 'down';
  const isNeutral = trend === 'neutral';

  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const trendColorClass = isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-muted-foreground';
  const trendBgClass = isUp ? 'bg-green-500/10' : isDown ? 'bg-red-500/10' : 'bg-muted/50';

  // Basic SVG path generator for sparkline if data is provided
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length === 0) return null;
    
    // Normalize data to fit in a 100x30 SVG box
    const max = Math.max(...sparklineData);
    const min = Math.min(...sparklineData);
    const range = max - min || 1;
    
    const points = sparklineData.map((val, i) => {
      const x = (i / (sparklineData.length - 1)) * 100;
      const y = 30 - ((val - min) / range) * 30;
      return `${x},${y}`;
    }).join(' ');

    const strokeColor = isUp ? '#10b981' : isDown ? '#ef4444' : '#64748b';

    return (
      <svg viewBox="0 -5 100 40" className="w-24 h-8 overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`gradient-${title.replace(/\\s+/g, '')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`M 0,40 L ${points.split(' ')[0]} L ${points} L 100,40 Z`}
          fill={`url(#gradient-${title.replace(/\\s+/g, '')})`}
        />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  return (
    <Card className="p-5 flex flex-col gap-4 relative overflow-hidden group">
      <div className="flex justify-between items-start">
        <div className="space-y-1 z-10">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-3xl font-bold tracking-tight text-foreground">{value}</h3>
          </div>
        </div>
        
        {Icon && (
          <div className="p-2.5 rounded-xl bg-surface border border-border/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20 transition-colors z-10">
            <Icon className="w-5 h-5 stroke-[2px]" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto z-10">
        {trendValue && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${trendBgClass} ${trendColorClass}`}>
            <TrendIcon className="w-3 h-3 stroke-[3px]" />
            <span>{trendValue}</span>
          </div>
        )}
        
        <div className="ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
          {renderSparkline()}
        </div>
      </div>
    </Card>
  );
}
