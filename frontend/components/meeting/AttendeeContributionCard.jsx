'use client';

import { useState } from 'react';
import { Mic, Clock, MessageSquare, ChevronDown, ChevronUp, Award } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export default function AttendeeContributionCard({ attendee, contributions = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const user = attendee.user || attendee;
  const contribution = contributions.find(c =>
    c.user?._id === user._id || c.user === user._id
  ) || attendee;

  const score = contribution.contributionScore || contribution.score || 0;
  const speakingTime = contribution.speakingTime || 0;
  const keyPoints = contribution.keyPoints || [];

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-green-400';
    if (score >= 5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score) => {
    if (score >= 9) return 'Excellent';
    if (score >= 7) return 'Good';
    if (score >= 5) return 'Average';
    if (score >= 3) return 'Below Average';
    return 'Minimal';
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-muted/50 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatar} alt={user.name || user.fullName} />
            <AvatarFallback className="bg-slate-700 text-slate-300">
              {(user.firstName?.[0] || user.name?.[0] || '')}
              {(user.lastName?.[0] || '')}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-100 truncate">
                {user.firstName} {user.lastName}
              </p>
              {user.role && (
                <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300">
                  {user.role}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>

          <div className="text-right">
            <div className={cn('text-2xl font-bold', getScoreColor(score))}>
              {score.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">{getScoreLabel(score)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            

          </div>

          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-slate-500">Key Points</p>
              <p className="text-sm font-medium text-foreground">
                {keyPoints.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-slate-500">Contribution</p>
              <p className="text-sm font-medium text-foreground">
                {(score * 10).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Progress value={score * 10} className="h-2" />
        </div>

        {keyPoints.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 w-full text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Hide Key Points
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show {keyPoints.length} Key Points
              </>
            )}
          </Button>
        )}
      </div>

      {isExpanded && keyPoints.length > 0 && (
        <div className="px-4 pb-4 border-t border-slate-700">
          <div className="pt-4 space-y-2">
            <p className="text-sm font-medium text-slate-300">Key Contributions:</p>
            <ul className="space-y-1">
              {keyPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary mt-1">•</span>
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
