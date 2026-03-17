'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Calendar, Clock, Users, Mic, FileText,
  CheckSquare, ArrowLeft, Download, Plus,
  Loader2, AlertCircle, StopCircle, Pencil, X
} from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/axios';
import { CardSkeleton } from '@/components/shared/Skeleton';
import AttendeeContributionCard from '@/components/meeting/AttendeeContributionCard';
import ProcessingStepIndicator from '@/components/meeting/ProcessingStepIndicator';
import MeetingQAPanel from '@/components/meeting/MeetingQAPanel';
import SimilarMeetingsPanel from '@/components/meeting/SimilarMeetingsPanel';
import toast from 'react-hot-toast';

export default function MeetingDetailPage({ params }) {
  const router = useRouter();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnding, setIsEnding] = useState(false);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  // ── Transcript speaker correction state ──
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [editingSegmentIdx, setEditingSegmentIdx] = useState(null);
  const [transcriptHasChanges, setTranscriptHasChanges] = useState(false);
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);

  const SPEAKER_COLORS = [
    'text-blue-400', 'text-green-400', 'text-purple-400',
    'text-yellow-400', 'text-pink-400', 'text-cyan-400',
  ];

  useEffect(() => {
    fetchMeeting();
  }, [params?.id]);

  useEffect(() => {
    if (meeting?.status === 'processing') {
      const interval = setInterval(fetchProcessingStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [meeting?.status]);

  const fetchMeeting = async () => {
    if (!params?.id) return;
    try {
      const response = await api.get(`/meetings/${params.id}`);
      setMeeting(response.data.meeting);
      setTranscriptSegments(response.data.meeting?.transcriptSegments || []);
      if (response.data.meeting?.status === 'processing') {
        fetchProcessingStatus();
      }
    } catch (error) {
      console.error('Failed to fetch meeting:', error);
      toast.error('Failed to fetch meeting details');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProcessingStatus = async () => {
    try {
      const response = await api.get(`/meetings/${params.id}/processing-status`);
      setProcessingStatus(response.data);
      if (response.data.status === 'ready') {
        fetchMeeting();
      }
    } catch (error) {
      console.error('Failed to fetch processing status:', error);
    }
  };

  const handleEndMeeting = async () => {
    if (!confirm('Are you sure you want to end this meeting?')) return;
    setIsEnding(true);
    try {
      await api.post(`/meetings/${params.id}/end`);
      toast.success('Meeting ended successfully');
      fetchMeeting();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to end meeting');
    } finally {
      setIsEnding(false);
    }
  };

  // ── Transcript speaker correction handlers ──
  const uniqueSpeakers = [...new Set(transcriptSegments.map(s => s.speaker).filter(Boolean))];
  const speakerColorMap = Object.fromEntries(
    uniqueSpeakers.map((name, i) => [name, SPEAKER_COLORS[i % SPEAKER_COLORS.length]])
  );

  const attendeeNameList = (meeting?.attendees || [])
    .map(a => `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim())
    .filter(Boolean);

  const handleSpeakerChange = (segIdx, newSpeaker) => {
    setTranscriptSegments(prev =>
      prev.map((seg, i) => i === segIdx ? { ...seg, speaker: newSpeaker } : seg)
    );
    setEditingSegmentIdx(null);
    setTranscriptHasChanges(true);
  };

  const handleSaveTranscript = async () => {
    setIsSavingTranscript(true);
    try {
      await api.put(`/meetings/${params.id}/transcript-segments`, { transcriptSegments });
      toast.success('Speaker corrections saved');
      setTranscriptHasChanges(false);
    } catch (error) {
      toast.error('Failed to save corrections');
    } finally {
      setIsSavingTranscript(false);
    }
  };

  // ── STYLED XLSX EXPORT ──────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!meeting) return;

    const loadingToast = toast.loading('Generating Excel report...');

    try {
      await new Promise((resolve, reject) => {
        if (window.ExcelJS) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      const ExcelJS = window.ExcelJS;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'OrgOS';
      const ws = wb.addWorksheet('Meeting Summary', { views: [{ showGridLines: false }] });

      const DARK_BG      = '1E1E2E';
      const ACCENT       = '6C63FF';
      const ACCENT_LIGHT = 'EAE8FF';
      const MID_BG       = 'F5F4FF';
      const WHITE        = 'FFFFFFFF';
      const BORDER_CLR   = 'FFD0CEEE';
      const TEXT_DARK    = 'FF1A1A2E';
      const TEXT_MID     = 'FF4A4A6A';
      const TEXT_MUTED   = 'FFAAAACC';
      const GREEN_BG     = 'FFE6F4EA';
      const GREEN_DARK   = 'FF2E7D32';
      const ORANGE_BG    = 'FFFFF3E0';
      const ORANGE_DARK  = 'FFE65100';
      const RED_BG       = 'FFFDECEA';
      const RED_DARK     = 'FFB71C1C';
      const HDR_BG       = '3D3A6E';

      ws.columns = [
        { width: 3 },
        { width: 22 },
        { width: 36 },
        { width: 22 },
        { width: 16 },
        { width: 14 },
        { width: 3 },
      ];

      const thinBorder = {
        top:    { style: 'thin', color: { argb: BORDER_CLR } },
        bottom: { style: 'thin', color: { argb: BORDER_CLR } },
        left:   { style: 'thin', color: { argb: BORDER_CLR } },
        right:  { style: 'thin', color: { argb: BORDER_CLR } },
      };

      const solidFill = (hex) => ({
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: hex.replace('#', '').length === 6 ? 'FF' + hex.replace('#', '') : hex.replace('#', '') }
      });

      const font = (opts = {}) => ({
        name: 'Arial',
        size: opts.size || 10,
        bold: opts.bold || false,
        italic: opts.italic || false,
        color: { argb: (opts.color || TEXT_DARK).replace('#', '') },
      });

      const align = (h = 'left', v = 'middle', wrap = false) => ({
        horizontal: h, vertical: v, wrapText: wrap,
      });

      const setCell = (row, col, value, opts = {}) => {
        const c = ws.getCell(row, col);
        c.value = value;
        c.font = font(opts);
        c.alignment = align(opts.align || 'left', 'middle', opts.wrap || false);
        if (opts.fill) c.fill = solidFill(opts.fill);
        if (opts.border) c.border = thinBorder;
        return c;
      };

      const mergeSet = (r, c1, c2, value, opts = {}) => {
        ws.mergeCells(r, c1, r, c2);
        return setCell(r, c1, value, opts);
      };

      const sectionHeader = (r, label) => {
        ws.getRow(r).height = 22;
        mergeSet(r, 1, 7, label, {
          bold: true, size: 9, color: 'FFFFFFFF',
          fill: ACCENT, align: 'left', border: true,
        });
      };

      const spacer = (r, h = 8, bg = 'FFF8F8FC') => {
        ws.getRow(r).height = h;
        for (let c = 1; c <= 7; c++) ws.getCell(r, c).fill = solidFill(bg);
      };

      spacer(1, 8, DARK_BG);
      ws.getRow(2).height = 42;
      mergeSet(2, 1, 7, '📋  Meeting Summary Report', {
        bold: true, size: 18, color: 'FFFFFFFF', fill: DARK_BG, align: 'center',
      });

      const exportAttendeeNames = (meeting.attendees || [])
        .map(a => a.user ? `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() : (a.name || String(a)))
        .join('  •  ');
      const meetingDate = meeting.scheduledDate ? format(new Date(meeting.scheduledDate), 'MMM d, yyyy') : '';
      const duration = `${meeting.actualDuration || meeting.estimatedDuration || 0} min`;

      ws.getRow(3).height = 20;
      mergeSet(3, 1, 7,
        `${meeting.name || ''}  •  ${meetingDate}  •  ${meeting.domain || ''}  •  ${duration}`,
        { size: 10, color: 'FFAAAACC', fill: DARK_BG, align: 'center', italic: true }
      );
      spacer(4, 8, DARK_BG);
      spacer(5, 8, 'FFF8F8FC');

      ws.getRow(6).height = 14;
      mergeSet(6, 1, 7, '  MEETING DETAILS', {
        bold: true, size: 8, color: ACCENT, fill: 'EAE8FF', align: 'left',
      });

      const infoRows = [
        ['Title',         meeting.name || ''],
        ['Date',          meetingDate],
        ['Duration',      duration],
        ['Type / Domain', meeting.domain || ''],
        ['Status',        `✅  ${meeting.status || ''}`],
        ['Attendees',     exportAttendeeNames],
      ];
      infoRows.forEach(([label, value], i) => {
        const r = 7 + i;
        ws.getRow(r).height = 18;
        setCell(r, 1, '', { fill: 'EAE8FF' });
        setCell(r, 2, label, { bold: true, size: 9, color: 'FF4A4A6A', fill: 'EAE8FF', border: true });
        ws.mergeCells(r, 3, r, 6);
        setCell(r, 3, value, { size: 10, color: 'FF1A1A2E', fill: WHITE, border: true, wrap: true });
        setCell(r, 7, '', { fill: 'EAE8FF' });
      });

      spacer(13, 10);
      sectionHeader(14, '  📝  Summary');
      ws.getRow(15).height = 60;
      setCell(15, 1, '', { fill: 'EAE8FF' });
      ws.mergeCells(15, 2, 15, 6);
      setCell(15, 2, meeting.summary || 'No summary available.', {
        size: 10, fill: WHITE, border: true, wrap: true, color: 'FF1A1A2E',
      });
      setCell(15, 7, '', { fill: 'EAE8FF' });

      spacer(16, 10);
      sectionHeader(17, '  💡  Key Conclusions');
      const conclusions = meeting.conclusions || [];
      const conclusionStart = 18;
      if (conclusions.length === 0) {
        ws.getRow(conclusionStart).height = 20;
        setCell(conclusionStart, 1, '', { fill: 'EAE8FF' });
        setCell(conclusionStart, 2, '1', { bold: true, size: 11, color: ACCENT, fill: WHITE, align: 'center', border: true });
        ws.mergeCells(conclusionStart, 3, conclusionStart, 6);
        setCell(conclusionStart, 3, 'No conclusions recorded.', { size: 10, fill: WHITE, border: true, italic: true, color: 'FF4A4A6A' });
        setCell(conclusionStart, 7, '', { fill: 'EAE8FF' });
      } else {
        conclusions.forEach((txt, i) => {
          const r = conclusionStart + i;
          ws.getRow(r).height = 20;
          const bg = i % 2 === 0 ? WHITE : 'F5F4FF';
          setCell(r, 1, '', { fill: 'EAE8FF' });
          setCell(r, 2, `  ${i + 1}`, { bold: true, size: 11, color: ACCENT, fill: bg, align: 'center', border: true });
          ws.mergeCells(r, 3, r, 6);
          setCell(r, 3, txt, { size: 10, fill: bg, border: true, wrap: true, color: 'FF1A1A2E' });
          setCell(r, 7, '', { fill: 'EAE8FF' });
        });
      }
      let nextRow = conclusionStart + Math.max(conclusions.length, 1);

      spacer(nextRow, 10); nextRow++;
      sectionHeader(nextRow, '  ⚖️  Decisions'); nextRow++;
      const decisions = meeting.decisions || [];
      if (decisions.length === 0) {
        ws.getRow(nextRow).height = 20;
        setCell(nextRow, 1, '', { fill: 'EAE8FF' });
        setCell(nextRow, 2, '1', { bold: true, size: 11, color: ACCENT, fill: WHITE, align: 'center', border: true });
        ws.mergeCells(nextRow, 3, nextRow, 6);
        setCell(nextRow, 3, 'No decisions recorded.', { size: 10, fill: WHITE, border: true, italic: true, color: 'FF4A4A6A' });
        setCell(nextRow, 7, '', { fill: 'EAE8FF' });
        nextRow++;
      } else {
        decisions.forEach((txt, i) => {
          ws.getRow(nextRow).height = 20;
          const bg = i % 2 === 0 ? WHITE : 'F5F4FF';
          setCell(nextRow, 1, '', { fill: 'EAE8FF' });
          setCell(nextRow, 2, `  ${i + 1}`, { bold: true, size: 11, color: ACCENT, fill: bg, align: 'center', border: true });
          ws.mergeCells(nextRow, 3, nextRow, 6);
          setCell(nextRow, 3, txt, { size: 10, fill: bg, border: true, wrap: true, color: 'FF1A1A2E' });
          setCell(nextRow, 7, '', { fill: 'EAE8FF' });
          nextRow++;
        });
      }

      spacer(nextRow, 10); nextRow++;
      sectionHeader(nextRow, '  ✅  Action Items'); nextRow++;
      ws.getRow(nextRow).height = 18;
      ['', '#', 'Task', 'Assigned To', 'Deadline', 'Status', ''].forEach((h, i) => {
        const c = ws.getCell(nextRow, i + 1);
        c.value = h;
        c.font = font({ bold: true, size: 9, color: 'FFFFFFFF' });
        c.fill = solidFill(HDR_BG);
        c.alignment = align((['#', 'Status', 'Deadline'].includes(h)) ? 'center' : 'left');
        c.border = thinBorder;
      });
      nextRow++;

      const actionItems = meeting.actionItems || [];
      if (actionItems.length === 0) {
        ws.getRow(nextRow).height = 20;
        setCell(nextRow, 1, '', { fill: WHITE });
        setCell(nextRow, 2, '', { fill: WHITE, border: true });
        ws.mergeCells(nextRow, 3, nextRow, 6);
        setCell(nextRow, 3, 'No action items recorded.', { size: 10, fill: WHITE, border: true, italic: true, color: 'FF4A4A6A' });
        setCell(nextRow, 7, '', { fill: WHITE });
        nextRow++;
      } else {
        actionItems.forEach((item, i) => {
          ws.getRow(nextRow).height = 20;
          const bg = i % 2 === 0 ? WHITE : 'F5F4FF';
          const status = item.status || 'pending';
          let sBg = ORANGE_BG, sClr = ORANGE_DARK;
          if (status === 'completed')   { sBg = GREEN_BG;    sClr = GREEN_DARK; }
          if (status === 'in_progress') { sBg = 'FFE3F2FD';  sClr = 'FF1565C0'; }
          const ownerName = item.owner
            ? `${item.owner.firstName || ''} ${item.owner.lastName || ''}`.trim()
            : '';
          const deadline = item.deadline ? format(new Date(item.deadline), 'MMM d, yyyy') : '—';
          setCell(nextRow, 1, '', { fill: bg });
          setCell(nextRow, 2, `  ${i + 1}`, { bold: true, size: 10, color: ACCENT, fill: bg, align: 'center', border: true });
          setCell(nextRow, 3, item.task || '', { size: 10, fill: bg, border: true, wrap: true, color: 'FF1A1A2E' });
          setCell(nextRow, 4, ownerName, { size: 10, fill: bg, border: true, align: 'center', color: 'FF1A1A2E' });
          setCell(nextRow, 5, deadline, { size: 10, fill: bg, border: true, align: 'center', italic: true, color: 'FF4A4A6A' });
          setCell(nextRow, 6, status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), {
            bold: true, size: 9, color: sClr, fill: sBg, align: 'center', border: true,
          });
          setCell(nextRow, 7, '', { fill: bg });
          nextRow++;
        });
      }

      spacer(nextRow, 10); nextRow++;
      sectionHeader(nextRow, '  🔁  Follow-up Topics'); nextRow++;
      const followUpTopics = meeting.followUpTopics || [];
      if (followUpTopics.length === 0) {
        ws.getRow(nextRow).height = 20;
        setCell(nextRow, 1, '', { fill: 'EAE8FF' });
        setCell(nextRow, 2, '1', { bold: true, size: 11, color: ACCENT, fill: WHITE, align: 'center', border: true });
        ws.mergeCells(nextRow, 3, nextRow, 6);
        setCell(nextRow, 3, 'No follow-up topics recorded.', { size: 10, fill: WHITE, border: true, italic: true, color: 'FF4A4A6A' });
        setCell(nextRow, 7, '', { fill: 'EAE8FF' });
        nextRow++;
      } else {
        followUpTopics.forEach((txt, i) => {
          ws.getRow(nextRow).height = 20;
          const bg = i % 2 === 0 ? WHITE : 'F5F4FF';
          setCell(nextRow, 1, '', { fill: 'EAE8FF' });
          setCell(nextRow, 2, `  ${i + 1}`, { bold: true, size: 11, color: ACCENT, fill: bg, align: 'center', border: true });
          ws.mergeCells(nextRow, 3, nextRow, 6);
          setCell(nextRow, 3, txt, { size: 10, fill: bg, border: true, wrap: true, color: 'FF1A1A2E' });
          setCell(nextRow, 7, '', { fill: 'EAE8FF' });
          nextRow++;
        });
      }

      spacer(nextRow, 10); nextRow++;
      sectionHeader(nextRow, '  👥  Attendee Contributions'); nextRow++;
      ws.getRow(nextRow).height = 18;
      [['', 1], ['Attendee', 2], ['Score', 3], ['Key Points', 4], ['Speaking Time', 6], ['', 7]].forEach(([h, c]) => {
        const cell = ws.getCell(nextRow, c);
        cell.value = h;
        cell.font = font({ bold: true, size: 9, color: 'FFFFFFFF' });
        cell.fill = solidFill(HDR_BG);
        cell.alignment = align(['Score', 'Speaking Time'].includes(h) ? 'center' : 'left');
        cell.border = thinBorder;
      });
      ws.mergeCells(nextRow, 4, nextRow, 5);
      nextRow++;

      const contributions = meeting.attendeeContributions || [];
      if (contributions.length === 0) {
        ws.getRow(nextRow).height = 20;
        setCell(nextRow, 1, '', { fill: WHITE });
        ws.mergeCells(nextRow, 2, nextRow, 6);
        setCell(nextRow, 2, 'No contribution data available.', { size: 10, fill: WHITE, border: true, italic: true, color: 'FF4A4A6A' });
        setCell(nextRow, 7, '', { fill: WHITE });
        nextRow++;
      } else {
        contributions.forEach((c, i) => {
          ws.getRow(nextRow).height = 22;
          const bg = i % 2 === 0 ? WHITE : 'F5F4FF';
          const score = c.contributionScore ?? c.score ?? 0;
          let sBg = RED_BG, sClr = RED_DARK;
          if (score >= 8) { sBg = GREEN_BG;  sClr = GREEN_DARK; }
          else if (score >= 5) { sBg = ORANGE_BG; sClr = ORANGE_DARK; }
          const keyPoints = Array.isArray(c.keyPoints) ? c.keyPoints.join(' | ') : (c.keyPoints || '');
          setCell(nextRow, 1, '', { fill: bg });
          setCell(nextRow, 2, `  ${c.name || ''}`, { bold: true, size: 10, fill: bg, border: true, color: 'FF1A1A2E' });
          setCell(nextRow, 3, score, { bold: true, size: 11, color: sClr, fill: sBg, align: 'center', border: true });
          ws.mergeCells(nextRow, 4, nextRow, 5);
          setCell(nextRow, 4, keyPoints, { size: 9, fill: bg, border: true, wrap: true, color: 'FF4A4A6A' });
          setCell(nextRow, 6, c.speakingTime || '—', { size: 9, fill: bg, border: true, align: 'center', color: 'FF4A4A6A' });
          setCell(nextRow, 7, '', { fill: bg });
          nextRow++;
        });
      }

      spacer(nextRow, 8); nextRow++;
      ws.getRow(nextRow).height = 18;
      mergeSet(nextRow, 1, 7,
        'Generated by OrgOS  •  AI-Powered Organization Operating System',
        { size: 8, color: 'FFAAAACC', fill: DARK_BG, align: 'center', italic: true }
      );

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = (meeting.name || 'meeting').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.href = url;
      link.download = `${safeName}_summary.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.dismiss(loadingToast);
      toast.success('Excel report exported!');
    } catch (err) {
      console.error('Export failed:', err);
      toast.dismiss(loadingToast);
      toast.error('Export failed. Please try again.');
    }
  };
  // ───────────────────────────────────────────────────────────────────────────

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':     return 'bg-green-500/20 text-green-400';
      case 'processing':return 'bg-yellow-500/20 text-yellow-400';
      case 'scheduled': return 'bg-blue-500/20 text-blue-400';
      case 'live':      return 'bg-red-500/20 text-red-400';
      case 'cancelled': return 'bg-red-900/20 text-red-700';
      case 'completed': return 'bg-slate-500/20 text-muted-foreground';
      default:          return 'bg-slate-500/20 text-muted-foreground';
    }
  };

  const getDomainColor = (domain) => {
    const colors = {
      'Sprint Planning':          'bg-blue-500/20 text-blue-400',
      'Performance Review':       'bg-green-500/20 text-green-400',
      'Architecture Discussion':  'bg-purple-500/20 text-purple-400',
      '1:1':                      'bg-yellow-500/20 text-yellow-400',
      'All-Hands':                'bg-red-500/20 text-red-400',
      'Custom':                   'bg-slate-500/20 text-muted-foreground'
    };
    return colors[domain] || colors['Custom'];
  };

  const hostId = meeting?.host?._id?.toString() || meeting?.host?.toString();
  const userId = user?._id?.toString() || user?.id?.toString();
  const isHost = !!(hostId && userId && hostId === userId);
  const isProcessing = meeting?.status === 'processing';
  const isReady = meeting?.status === 'ready' || meeting?.status === 'completed';

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/meetings/history')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardSkeleton className="flex-1" />
          </div>
          <CardSkeleton />
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-500" />
          <p className="text-muted-foreground">Meeting not found</p>
          <Button className="mt-4" onClick={() => router.push('/meetings/history')}>
            Back to Meetings
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Cancelled banner */}
        {meeting.status === 'cancelled' && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">
              This meeting has been cancelled by the host.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/meetings/history')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{meeting.name}</h1>
                <Badge className={getStatusColor(meeting.status)}>
                  {meeting.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">{meeting.description}</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {isReady && (
              <Button variant="outline" onClick={handleExport} className="border-slate-700">
                <Download className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
            )}

            {meeting.status === 'scheduled' && (
              <Button
                onClick={() => router.push(`/meetings/${meeting._id}/room`)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Mic className="mr-2 h-4 w-4" />
                Join Meeting
              </Button>
            )}

            {meeting.status === 'live' && (
              <Button
                onClick={() => router.push(`/meetings/${meeting._id}/room`)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Mic className="mr-2 h-4 w-4" />
                Rejoin Meeting
              </Button>
            )}

            {(meeting.status === 'live' || meeting.status === 'scheduled') && isHost && (
              <Button
                onClick={handleEndMeeting}
                disabled={isEnding}
                className="bg-red-600 hover:bg-red-700"
              >
                {isEnding
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <StopCircle className="mr-2 h-4 w-4" />
                }
                End Meeting
              </Button>
            )}

            {['ready', 'completed', 'processing'].includes(meeting.status) && (
              <Button
                variant="outline"
                className="border-slate-700"
                onClick={() => setActiveTab('summary')}
              >
                <FileText className="mr-2 h-4 w-4" />
                View Summary
              </Button>
            )}

            {isReady && (
              <Button
                onClick={() => router.push(`/meetings/${meeting._id}/schedule-followup`)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Schedule Follow-up
              </Button>
            )}
          </div>
        </div>

        {/* Processing Indicator */}
        {isProcessing && processingStatus && (
          <Card className="bg-card border-muted border-yellow-500/30">
            <CardContent className="py-6">
              <ProcessingStepIndicator
                processingSteps={processingStatus.processingSteps}
                error={processingStatus.error}
              />
            </CardContent>
          </Card>
        )}

        {/* Meeting Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-slate-500">Date</p>
                <p className="font-medium">{format(new Date(meeting.scheduledDate), 'MMM d, yyyy')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-slate-500">Duration</p>
                <p className="font-medium">{meeting.actualDuration || meeting.estimatedDuration || 0} min</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-slate-500">Attendees</p>
                <p className="font-medium">{meeting.attendees?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-slate-500">Type</p>
                <Badge className={getDomainColor(meeting.domain)}>{meeting.domain}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="bg-card border border-muted">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="attendees">Attendees</TabsTrigger>
                <TabsTrigger value="action-items">Action Items</TabsTrigger>
              </TabsList>

              {/* SUMMARY TAB */}
              <TabsContent value="summary">
                <Card className="bg-card border-muted">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Meeting Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {meeting.summary ? (
                      <>
                        <p className="text-slate-300">{meeting.summary}</p>
                        {meeting.conclusions?.length > 0 && (
                          <div>
                            <p className="font-medium mb-2">Key Conclusions:</p>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                              {meeting.conclusions.map((conclusion, i) => (
                                <li key={i}>{conclusion}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {meeting.decisions?.length > 0 && (
                          <div>
                            <p className="font-medium mb-2">Decisions:</p>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                              {meeting.decisions.map((decision, i) => (
                                <li key={i}>{decision}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-slate-500">
                        {isProcessing
                          ? 'Summary will be available after processing...'
                          : meeting.status === 'cancelled'
                          ? 'Meeting was cancelled — no summary available.'
                          : 'No summary available'}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TRANSCRIPT TAB — with inline speaker correction */}
              <TabsContent value="transcript">
                <Card className="bg-card border-muted">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Transcript</CardTitle>
                      {transcriptHasChanges && (
                        <Button
                          size="sm"
                          onClick={handleSaveTranscript}
                          disabled={isSavingTranscript}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {isSavingTranscript && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                          {isSavingTranscript ? 'Saving...' : 'Save corrections'}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {transcriptSegments.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 mb-3">
                          AI has assigned speakers. Click any name to correct it.
                        </p>
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-3 pr-2">
                            {transcriptSegments.map((seg, i) => (
                              <div key={i} className="p-3 bg-muted/50 rounded-lg group">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  {editingSegmentIdx === i ? (
                                    <div className="flex items-center gap-1">
                                      <select
                                        autoFocus
                                        defaultValue={seg.speaker}
                                        onChange={(e) => handleSpeakerChange(i, e.target.value)}
                                        className="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-slate-200 focus:outline-none"
                                      >
                                        {attendeeNameList.map(name => (
                                          <option key={name} value={name}>{name}</option>
                                        ))}
                                        <option value="Unknown Speaker">Unknown Speaker</option>
                                      </select>
                                      <button
                                        onClick={() => setEditingSegmentIdx(null)}
                                        className="text-slate-400 hover:text-slate-200 ml-1"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setEditingSegmentIdx(i)}
                                      className={`flex items-center gap-1 font-medium text-sm hover:opacity-80 ${speakerColorMap[seg.speaker] || 'text-slate-400'}`}
                                      title="Click to correct speaker"
                                    >
                                      {seg.speaker}
                                      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                                    </button>
                                  )}
                                  <span className="text-xs text-slate-500">
                                    {Math.floor((seg.startTime || 0) / 60)}:{((seg.startTime || 0) % 60).toString().padStart(2, '0')}
                                  </span>
                                </div>
                                <p className="text-slate-300 text-sm">{seg.text}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : meeting?.transcriptRaw ? (
                      <ScrollArea className="h-[400px]">
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-slate-500 mb-2">
                            Speaker detection not available — showing raw transcript.
                          </p>
                          <p className="text-slate-300 whitespace-pre-wrap text-sm">{meeting.transcriptRaw}</p>
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-slate-500">
                        {isProcessing ? 'Transcript will be available after processing...' : 'No transcript available'}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ATTENDEES TAB */}
              <TabsContent value="attendees">
                <Card className="bg-card border-muted">
                  <CardHeader>
                    <CardTitle>Attendees</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {meeting.attendees?.map((attendee) => (
                        <AttendeeContributionCard
                          key={attendee.user?._id || attendee._id}
                          attendee={attendee}
                          contributions={meeting.attendeeContributions}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ACTION ITEMS TAB */}
              <TabsContent value="action-items">
                <Card className="bg-card border-muted">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckSquare className="h-5 w-5" />
                      Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {meeting.actionItems?.length > 0 ? (
                      <div className="space-y-3">
                        {meeting.actionItems.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                            <div className="mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                item.status === 'completed'
                                  ? 'bg-green-500 border-green-500'
                                  : 'border-slate-600'
                              }`}>
                                {item.status === 'completed' && <CheckSquare className="h-3 w-3 text-white" />}
                              </div>
                            </div>
                            <div className="flex-1">
                              <p className={item.status === 'completed' ? 'line-through text-slate-500' : ''}>
                                {item.task}
                              </p>
                              {item.owner && (
                                <p className="text-sm text-muted-foreground">
                                  Assigned to: {item.owner.firstName} {item.owner.lastName}
                                </p>
                              )}
                              {item.deadline && (
                                <p className="text-sm text-muted-foreground">
                                  Due: {format(new Date(item.deadline), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>
                            <Badge className={
                              item.status === 'completed'   ? 'bg-green-500/20 text-green-400' :
                              item.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }>
                              {item.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500">No action items extracted</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <MeetingQAPanel meetingId={meeting._id} meetingName={meeting.name} />
            <SimilarMeetingsPanel meetingId={meeting._id} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}