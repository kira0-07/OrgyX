import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Lightbulb, CheckSquare, Target } from 'lucide-react';

export default function MeetingSummaryPanel({ meeting, isProcessing }) {
  if (!meeting) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Executive Summary */}
      <Card className="bg-surface border-border card-elevated overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
        <CardHeader className="pb-3 pt-5 px-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {meeting.summary ? (
            <p className="text-foreground/90 leading-relaxed text-sm">
              {meeting.summary}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  Generating AI summary...
                </>
              ) : meeting.status === 'cancelled' ? (
                'Meeting was cancelled — no summary available.'
              ) : (
                'No summary available.'
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Key Conclusions */}
        <Card className="bg-surface border-border card-elevated h-full">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <div className="text-amber-500">
                <Lightbulb className="h-4 w-4" />
              </div>
              Key Conclusions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {meeting.conclusions?.length > 0 ? (
              <ul className="space-y-3">
                {meeting.conclusions.map((c, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/80 leading-relaxed">
                    <span className="text-amber-500/50 mt-0.5 shrink-0">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">No conclusions recorded.</p>
            )}
          </CardContent>
        </Card>

        {/* Decisions Made */}
        <Card className="bg-surface border-border card-elevated h-full">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <div className="text-green-500">
                <Target className="h-4 w-4" />
              </div>
              Decisions Built
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {meeting.decisions?.length > 0 ? (
              <ul className="space-y-3">
                {meeting.decisions.map((d, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/80 leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500/50 mt-1.5 shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">No final decisions logged.</p>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
