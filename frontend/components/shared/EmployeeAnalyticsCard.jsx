import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function EmployeeAnalyticsCard({ 
  employee, 
  score = 0, 
  trend = 'neutral', 
  riskLevel = 'low' 
}) {
  const isUp = trend === 'improving';
  const isDown = trend === 'declining';
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  // Determine RAG color class
  const ragStatus = score >= 80 ? 'rag-green' : score < 60 ? 'rag-red' : 'rag-amber';
  let riskStatus = 'rag-green';
  if (riskLevel === 'high') riskStatus = 'rag-red';
  else if (riskLevel === 'medium') riskStatus = 'rag-amber';

  // SVG Radial Progress
  const circleRadius = 24;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (score / 100) * circleCircumference;

  // Derive colors from CSS variables
  const getStrokeColor = () => {
    if (score >= 80) return 'hsl(var(--rag-green))';
    if (score < 60) return 'hsl(var(--rag-red))';
    return 'hsl(var(--rag-amber))';
  };

  return (
    <Card className="p-4 flex items-center justify-between group overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/10 transition-colors" />
      
      <div className="flex items-center gap-4 z-10 w-full">
        {/* Progress Ring with Avatar */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg className="w-16 h-16 transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r={circleRadius}
              stroke="hsl(var(--muted))"
              strokeWidth="4"
              fill="none"
            />
            <circle
              cx="32"
              cy="32"
              r={circleRadius}
              stroke={getStrokeColor()}
              strokeWidth="4"
              fill="none"
              strokeDasharray={circleCircumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-in-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Avatar className="w-10 h-10 border border-background">
              <AvatarFallback className="bg-surface text-foreground font-semibold text-xs">
                {employee?.firstName?.[0]}{employee?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-semibold text-foreground truncate">
              {employee?.firstName} {employee?.lastName}
            </h4>
            <div className={`rag-dot ${ragStatus.replace('rag-', '')}`} />
          </div>
          <p className="text-xs text-muted-foreground truncate">{employee?.role || 'Team Member'}</p>
          
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 min-w-[65px]">
              <span className="text-sm font-bold leading-none">{score}</span>
              <span className="text-[10px] text-muted-foreground uppercase leading-none mt-[2px]">Score</span>
            </div>
            
            <div className={`flex items-center text-xs ${isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-muted-foreground'}`}>
              <TrendIcon className="w-3.5 h-3.5 mr-0.5" />
              <span className="capitalize">{trend}</span>
            </div>
          </div>
        </div>

        {/* Risk Badge */}
        <div className="shrink-0 flex flex-col items-end gap-2 ml-2">
          {riskLevel !== 'low' && (
            <Badge variant={riskStatus} className="uppercase text-[10px] tracking-wider font-bold">
              {riskLevel} Risk
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
