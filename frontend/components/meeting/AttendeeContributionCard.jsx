'use client';

import { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Award } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export default function AttendeeContributionCard({ attendee, contributions = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const user = attendee.user || {};

  // ✅ FIX: match using both _id and id (Mongoose exposes both)
  const userId = user._id?.toString() || user.id?.toString() || '';

  const contribution = contributions.find(c => {
    const cId = c.user?._id?.toString() || c.user?.id?.toString() || c.user?.toString() || '';
    return cId === userId;
  }) || {};

  // ✅ FIX: user is always populated from API, use it directly
  const displayName = user.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : contribution.name || 'Unknown';

  const score = contribution.score ?? contribution.contributionScore ?? attendee.contributionScore ?? 0;
  const keyPoints = contribution.keyPoints || attendee.keyPoints || [];
  const displayAvatar = user.avatar || '';
  const displayRole = user.role || '';
  const initials = displayName !== 'Unknown'
    ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const getScoreColor = (s) => {
    if (s >= 8) return 'text-green-400';
    if (s >= 5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreLabel = (s) => {
    if (s >= 9) return 'Excellent';
    if (s >= 7) return 'Good';
    if (s >= 5) return 'Average';
    if (s >= 3) return 'Below Average';
    return 'Minimal';
  };

  return (
    <div className="rounded-xl border border-border/50 bg-surface overflow-hidden card-elevated transition-all">
      <div className="p-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12 border border-border">
            <AvatarImage src={displayAvatar} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-semibold text-foreground truncate">{displayName}</p>
              {displayRole && (
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground border-border bg-transparent shadow-none">
                  {displayRole}
                </Badge>
              )}
            </div>
            {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
          </div>

          <div className="text-right shrink-0 flex flex-col items-end">
            <div className={cn('text-3xl font-bold tracking-tight', getScoreColor(score))}>
              {Number(score).toFixed(1)}
            </div>
            <Badge variant="outline" className="mt-1 shadow-none border-border bg-transparent text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              {getScoreLabel(score)}
            </Badge>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover/50 border border-border/50">
            <div className="p-2 bg-primary/10 text-primary rounded-md">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Key Points</p>
              <p className="text-base font-semibold text-foreground">{keyPoints.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover/50 border border-border/50">
            <div className="p-2 bg-primary/10 text-primary rounded-md">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Contribution</p>
              <p className="text-base font-semibold text-foreground">{(score * 10).toFixed(0)}%</p>
            </div>
          </div>
        </div>

        <div className="mt-4 px-1">
          <Progress value={score * 10} className="h-1.5" />
        </div>

        {keyPoints.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-4 w-full text-muted-foreground hover:text-foreground hover:bg-surface-hover"
          >
            {isExpanded ? (
              <><ChevronUp className="h-4 w-4 mr-2" />Hide Insights</>
            ) : (
              <><ChevronDown className="h-4 w-4 mr-2" />Show {keyPoints.length} Key Insights</>
            )}
          </Button>
        )}
      </div>

      {isExpanded && keyPoints.length > 0 && (
        <div className="px-5 pb-5 border-t border-border bg-surface-hover/30">
          <div className="pt-4 space-y-3">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Meeting Intelligence</p>
            <ul className="space-y-2">
              {keyPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-3 text-sm text-foreground/80 leading-relaxed bg-surface p-3 rounded-lg border border-border/50 shadow-sm">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}