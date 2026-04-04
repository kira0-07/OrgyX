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
  Loader2, AlertCircle, StopCircle, Pencil, X,
  FileDown
} from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/axios';
import { CardSkeleton } from '@/components/shared/Skeleton';
import AttendeeContributionCard from '@/components/meeting/AttendeeContributionCard';
import ProcessingStepIndicator from '@/components/meeting/ProcessingStepIndicator';
import MeetingQAPanel from '@/components/meeting/MeetingQAPanel';
import SimilarMeetingsPanel from '@/components/meeting/SimilarMeetingsPanel';
import MeetingSummaryPanel from '@/components/meeting/MeetingSummaryPanel';
import toast from 'react-hot-toast';

export default function MeetingDetailPage({ params }) {
  const router = useRouter();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnding, setIsEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [editingSegmentIdx, setEditingSegmentIdx] = useState(null);
  const [transcriptHasChanges, setTranscriptHasChanges] = useState(false);
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);

  const SPEAKER_COLORS = [
    'text-blue-400', 'text-green-400', 'text-purple-400',
    'text-yellow-400', 'text-pink-400', 'text-cyan-400',
  ];

  useEffect(() => { fetchMeeting(); }, [params?.id]);

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
      if (response.data.meeting?.status === 'processing') fetchProcessingStatus();
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
      if (response.data.status === 'ready') fetchMeeting();
    } catch (error) {
      console.error('Failed to fetch processing status:', error);
    }
  };

  const handleEndMeeting = async () => {
    setShowEndConfirm(false);
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

  const getContributionName = (c) => {
    if (c.user?.firstName) return `${c.user.firstName} ${c.user.lastName || ''}`.trim();
    if (c.name) return c.name;
    const cId = c.user?._id?.toString() || c.user?.id?.toString() || c.user?.toString() || '';
    const matched = (meeting?.attendees || []).find(a => {
      const aId = a.user?._id?.toString() || a.user?.id?.toString() || '';
      return aId === cId;
    });
    if (matched?.user?.firstName) return `${matched.user.firstName} ${matched.user.lastName || ''}`.trim();
    return 'Unknown';
  };

  const formatTime = (seconds) => {
    const s = seconds || 0;
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const buildExportSections = () => {
    if (!meeting) return '';
    const meetingDate = meeting.scheduledDate ? format(new Date(meeting.scheduledDate), 'MMM d, yyyy') : '';
    const duration = `${meeting.actualDuration || meeting.estimatedDuration || 0} min`;
    const attendeeNames = (meeting.attendees || [])
      .map(a => a.user ? `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() : '')
      .filter(Boolean).join(', ');
    const transcript = transcriptSegments.length > 0
      ? transcriptSegments.map(seg => `  [${formatTime(seg.startTime)}] ${seg.speaker}: ${seg.text}`).join('\n')
      : (meeting.transcriptRaw || 'No transcript available');
    const contributions = (meeting.attendeeContributions || []).map(c => {
      const score = c.contributionScore ?? c.score ?? 0;
      const kp = Array.isArray(c.keyPoints) ? c.keyPoints.join('; ') : (c.keyPoints || '—');
      return `  ${getContributionName(c)}: Score ${score}/10 | Key Points: ${kp}`;
    }).join('\n');
    return { meetingDate, duration, attendeeNames, transcript, contributions };
  };

  const handleExportPDF = async () => {
    if (!meeting) return;
    const loadingToast = toast.loading('Generating PDF...');
    try {
      await new Promise((resolve, reject) => {
        if (window.jspdf) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
      });
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const s = buildExportSections();
      const pageW = 210, margin = 18, contentW = pageW - margin * 2;
      let y = 20;
      const ACCENT = [108, 99, 255], DARK = [30, 30, 46], GREY = [100, 100, 120], LIGHT = [240, 240, 248];
      const checkPage = (needed = 10) => { if (y + needed > 275) { doc.addPage(); y = 20; } };
      const sectionHeader = (title) => {
        checkPage(14);
        doc.setFillColor(...ACCENT); doc.roundedRect(margin, y, contentW, 9, 2, 2, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text(title, margin + 4, y + 6.2); y += 13;
        doc.setTextColor(...DARK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      };
      const bodyText = (text, indent = 0) => {
        if (!text) return;
        const lines = doc.splitTextToSize(text, contentW - indent);
        lines.forEach(line => { checkPage(6); doc.text(line, margin + indent, y); y += 5.5; }); y += 1;
      };
      const labelValue = (label, value) => {
        checkPage(6); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...GREY);
        doc.text(label + ':', margin, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK); doc.setFontSize(9.5);
        const lines = doc.splitTextToSize(value || '—', contentW - 38);
        doc.text(lines[0], margin + 38, y); y += 5.5;
        if (lines.length > 1) { lines.slice(1).forEach(l => { checkPage(6); doc.text(l, margin + 38, y); y += 5.5; }); }
      };
      doc.setFillColor(...DARK); doc.rect(0, 0, 210, 32, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text('Meeting Report', margin, 15); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 200);
      doc.text(`${meeting.name || ''}  •  ${s.meetingDate}  •  ${meeting.domain || ''}`, margin, 24); y = 42;
      doc.setFillColor(...LIGHT); doc.roundedRect(margin, y, contentW, 36, 3, 3, 'F'); y += 6;
      doc.setTextColor(...DARK); doc.setFontSize(9.5);
      labelValue('Title', meeting.name); labelValue('Date', s.meetingDate); labelValue('Duration', s.duration);
      labelValue('Type', meeting.domain); labelValue('Attendees', s.attendeeNames); y += 4;
      sectionHeader('Summary'); bodyText(meeting.summary || 'No summary available.');
      if (meeting.conclusions?.length > 0) { sectionHeader('Key Conclusions'); meeting.conclusions.forEach((c, i) => bodyText(`${i + 1}. ${c}`, 4)); }
      if (meeting.decisions?.length > 0) { sectionHeader('Decisions'); meeting.decisions.forEach((d, i) => bodyText(`${i + 1}. ${d}`, 4)); }
      sectionHeader('Action Items');
      if (meeting.actionItems?.length > 0) {
        meeting.actionItems.forEach((item, i) => {
          const owner = item.owner ? `${item.owner.firstName || ''} ${item.owner.lastName || ''}`.trim() : 'Unassigned';
          const deadline = item.deadline ? format(new Date(item.deadline), 'MMM d, yyyy') : 'No deadline';
          checkPage(14); doc.setFillColor(245, 245, 252); doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...DARK);
          const taskLines = doc.splitTextToSize(`${i + 1}. ${item.task || ''}`, contentW - 8);
          doc.text(taskLines[0], margin + 4, y + 4.5); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY);
          doc.text(`Owner: ${owner}  |  Due: ${deadline}  |  Status: ${(item.status || 'pending').replace(/_/g, ' ')}`, margin + 4, y + 9.5); y += 15;
        });
      } else { bodyText('No action items recorded.'); }
      if (meeting.followUpTopics?.length > 0) { sectionHeader('Follow-up Topics'); meeting.followUpTopics.forEach((f, i) => bodyText(`${i + 1}. ${f}`, 4)); }
      if (meeting.attendeeContributions?.length > 0) {
        sectionHeader('Attendee Contributions');
        meeting.attendeeContributions.forEach(c => {
          const score = c.contributionScore ?? c.score ?? 0;
          const kp = Array.isArray(c.keyPoints) ? c.keyPoints.join('; ') : (c.keyPoints || '—');
          const name = getContributionName(c);
          checkPage(12); const barColor = score >= 8 ? [46, 125, 50] : score >= 5 ? [230, 81, 0] : [183, 28, 28];
          doc.setFillColor(245, 245, 252); doc.roundedRect(margin, y, contentW, 11, 2, 2, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...DARK); doc.text(name, margin + 4, y + 4.5);
          doc.setFillColor(...barColor); doc.roundedRect(margin + contentW - 22, y + 2, (score / 10) * 18, 7, 1, 1, 'F');
          doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.text(`${score}/10`, margin + contentW - 21, y + 7);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
          const kpLines = doc.splitTextToSize(`Key Points: ${kp}`, contentW - 30);
          doc.text(kpLines[0], margin + 4, y + 9); y += 14;
        });
      }
      sectionHeader('Transcript');
      if (transcriptSegments.length > 0) {
        transcriptSegments.forEach(seg => {
          checkPage(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ACCENT);
          doc.text(`${seg.speaker}  `, margin, y); const spkW = doc.getTextWidth(`${seg.speaker}  `);
          doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY); doc.text(`[${formatTime(seg.startTime)}]`, margin + spkW, y); y += 4.5;
          doc.setTextColor(...DARK); doc.setFontSize(9);
          const lines = doc.splitTextToSize(seg.text || '', contentW - 4);
          lines.forEach(line => { checkPage(5); doc.text(line, margin + 2, y); y += 4.8; }); y += 1;
        });
      } else if (meeting.transcriptRaw) {
        const rawLines = doc.splitTextToSize(meeting.transcriptRaw, contentW);
        rawLines.forEach(line => { checkPage(5); doc.setFontSize(9); doc.setTextColor(...DARK); doc.text(line, margin, y); y += 4.8; });
      } else { bodyText('No transcript available.'); }
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i); doc.setFillColor(...DARK); doc.rect(0, 285, 210, 12, 'F');
        doc.setTextColor(150, 150, 170); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        doc.text('Generated by OrgOS  •  AI-Powered Organization Operating System', margin, 292);
        doc.text(`Page ${i} of ${totalPages}`, 210 - margin, 292, { align: 'right' });
      }
      const safeName = (meeting.name || 'meeting').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      doc.save(`${safeName}_report.pdf`);
      toast.dismiss(loadingToast); toast.success('PDF exported!');
    } catch (err) {
      console.error('PDF export failed:', err); toast.dismiss(loadingToast); toast.error('PDF export failed. Please try again.');
    }
  };

  const handleExportDOCX = async () => {
    if (!meeting) return;
    const loadingToast = toast.loading('Generating DOCX...');
    try {
      await new Promise((resolve, reject) => {
        if (window.docx && window.docx.Document) return resolve();
        const existing = document.getElementById('docx-cdn');
        if (existing) existing.remove();
        const script = document.createElement('script');
        script.id = 'docx-cdn';
        script.src = 'https://unpkg.com/docx@8.2.2/build/index.umd.js';
        script.onload = () => { if (window.docx && window.docx.Document) return resolve(); reject(new Error('docx library loaded but Document not found')); };
        script.onerror = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/docx/7.8.2/docx.umd.min.js';
          s2.onload = () => resolve(); s2.onerror = () => reject(new Error('Failed to load docx library'));
          document.head.appendChild(s2);
        };
        document.head.appendChild(script);
      });
      const docxLib = window.docx;
      if (!docxLib || !docxLib.Document) throw new Error('docx library not available');
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, Header, Footer } = docxLib;
      const s = buildExportSections();
      const ACCENT_COLOR = '6C63FF', DARK_COLOR = '1E1E2E', GREY_COLOR = '6B7280', LIGHT_BG = 'F0F0F8';
      const border = { style: BorderStyle.SINGLE, size: 1, color: 'D0CEEE' };
      const borders = { top: border, bottom: border, left: border, right: border };
      const sectionHeading = (text) => new Paragraph({ spacing: { before: 280, after: 100 }, shading: { fill: ACCENT_COLOR, type: ShadingType.CLEAR }, children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22, font: 'Arial' })], indent: { left: 120, right: 120 } });
      const bodyPara = (text, opts = {}) => new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: text || '', size: 20, font: 'Arial', color: opts.muted ? GREY_COLOR : DARK_COLOR, italics: opts.italic || false, bold: opts.bold || false })], indent: opts.indent ? { left: opts.indent } : undefined });
      const numberedItem = (text, num) => new Paragraph({ spacing: { before: 80, after: 80 }, indent: { left: 360, hanging: 280 }, children: [new TextRun({ text: `${num}.  `, bold: true, color: ACCENT_COLOR, size: 20, font: 'Arial' }), new TextRun({ text: text || '', size: 20, font: 'Arial', color: DARK_COLOR })] });
      const infoTable = (rows) => new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2200, 7160], rows: rows.map(([label, value]) => new TableRow({ children: [new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, shading: { fill: LIGHT_BG, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, color: GREY_COLOR, font: 'Arial' })] })] }), new TableCell({ borders, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: value || '—', size: 20, font: 'Arial', color: DARK_COLOR })] })] })] })) });
      const actionTable = (items) => {
        if (!items?.length) return bodyPara('No action items recorded.', { muted: true, italic: true });
        return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [3800, 2000, 1800, 1760], rows: [new TableRow({ tableHeader: true, children: ['Task', 'Assigned To', 'Deadline', 'Status'].map(h => new TableCell({ borders, shading: { fill: '3D3A6E', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })] })) }), ...items.map((item, i) => { const owner = item.owner ? `${item.owner.firstName || ''} ${item.owner.lastName || ''}`.trim() : 'Unassigned'; const deadline = item.deadline ? format(new Date(item.deadline), 'MMM d, yyyy') : '—'; const statusColor = item.status === 'completed' ? '2E7D32' : item.status === 'in_progress' ? '1565C0' : 'E65100'; const bg = i % 2 === 0 ? 'FFFFFF' : 'F5F4FF'; return new TableRow({ children: [new TableCell({ borders, width: { size: 3800, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: item.task || '', size: 19, font: 'Arial', color: DARK_COLOR })] })] }), new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: owner, size: 18, font: 'Arial', color: DARK_COLOR })] })] }), new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: deadline, size: 18, font: 'Arial', color: GREY_COLOR, italics: true })] })] }), new TableCell({ borders, width: { size: 1760, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: (item.status || 'pending').replace(/_/g, ' '), size: 18, font: 'Arial', bold: true, color: statusColor })] })] })] }); })] });
      };
      const children = [
        new Paragraph({ spacing: { before: 0, after: 160 }, shading: { fill: DARK_COLOR, type: ShadingType.CLEAR }, children: [new TextRun({ text: meeting.name || 'Meeting Report', bold: true, size: 44, color: 'FFFFFF', font: 'Arial' })] }),
        new Paragraph({ spacing: { before: 0, after: 320 }, children: [new TextRun({ text: `${s.meetingDate}  •  ${meeting.domain || ''}  •  ${s.duration}`, size: 20, color: GREY_COLOR, font: 'Arial', italics: true })] }),
        sectionHeading('📋  Meeting Details'),
        new Paragraph({ spacing: { before: 100, after: 100 } }),
        infoTable([['Title', meeting.name || ''], ['Date', s.meetingDate], ['Duration', s.duration], ['Type / Domain', meeting.domain || ''], ['Status', (meeting.status || '').toUpperCase()], ['Attendees', s.attendeeNames]]),
        new Paragraph({ spacing: { before: 200, after: 0 } }),
        sectionHeading('📝  Summary'),
        bodyPara(meeting.summary || 'No summary available.', { italic: !meeting.summary, muted: !meeting.summary }),
      ];
      if (meeting.conclusions?.length > 0) { children.push(sectionHeading('💡  Key Conclusions')); meeting.conclusions.forEach((c, i) => children.push(numberedItem(c, i + 1))); }
      if (meeting.decisions?.length > 0) { children.push(sectionHeading('⚖️  Decisions')); meeting.decisions.forEach((d, i) => children.push(numberedItem(d, i + 1))); }
      children.push(sectionHeading('✅  Action Items'));
      children.push(new Paragraph({ spacing: { before: 100, after: 100 } }));
      children.push(actionTable(meeting.actionItems));
      children.push(new Paragraph({ spacing: { before: 200, after: 0 } }));
      if (meeting.followUpTopics?.length > 0) { children.push(sectionHeading('🔁  Follow-up Topics')); meeting.followUpTopics.forEach((f, i) => children.push(numberedItem(f, i + 1))); }
      if (meeting.attendeeContributions?.length > 0) {
        children.push(sectionHeading('👥  Attendee Contributions'));
        children.push(new Paragraph({ spacing: { before: 100, after: 100 } }));
        children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2800, 1200, 5360], rows: [new TableRow({ tableHeader: true, children: ['Attendee', 'Score', 'Key Points'].map(h => new TableCell({ borders, shading: { fill: '3D3A6E', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })] })) }), ...meeting.attendeeContributions.map((c, i) => { const score = c.contributionScore ?? c.score ?? 0; const kp = Array.isArray(c.keyPoints) ? c.keyPoints.join('; ') : (c.keyPoints || '—'); const scoreColor = score >= 8 ? '2E7D32' : score >= 5 ? 'E65100' : 'B71C1C'; const bg = i % 2 === 0 ? 'FFFFFF' : 'F5F4FF'; const name = getContributionName(c); return new TableRow({ children: [new TableCell({ borders, width: { size: 2800, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: name, size: 19, bold: true, font: 'Arial', color: DARK_COLOR })] })] }), new TableCell({ borders, width: { size: 1200, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${score}/10`, size: 22, bold: true, font: 'Arial', color: scoreColor })] })] }), new TableCell({ borders, width: { size: 5360, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: kp, size: 18, font: 'Arial', color: GREY_COLOR })] })] })] }); })] }));
        children.push(new Paragraph({ spacing: { before: 200, after: 0 } }));
      }
      children.push(sectionHeading('🎙️  Transcript'));
      if (transcriptSegments.length > 0) {
        transcriptSegments.forEach(seg => {
          children.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: `${seg.speaker}  `, bold: true, color: ACCENT_COLOR, size: 19, font: 'Arial' }), new TextRun({ text: `[${formatTime(seg.startTime)}]`, color: GREY_COLOR, size: 17, font: 'Arial' })] }));
          children.push(new Paragraph({ spacing: { before: 0, after: 100 }, indent: { left: 240 }, children: [new TextRun({ text: seg.text || '', size: 19, font: 'Arial', color: DARK_COLOR })] }));
        });
      } else if (meeting.transcriptRaw) {
        children.push(bodyPara(meeting.transcriptRaw));
      } else { children.push(bodyPara('No transcript available.', { muted: true, italic: true })); }
      const doc = new Document({ styles: { default: { document: { run: { font: 'Arial', size: 20 } } } }, sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_COLOR, space: 4 } }, spacing: { after: 0 }, children: [new TextRun({ text: 'OrgOS  •  Meeting Report', bold: true, color: ACCENT_COLOR, size: 18, font: 'Arial' }), new TextRun({ text: `  |  ${meeting.name || ''}`, color: GREY_COLOR, size: 18, font: 'Arial' })] })] }) }, footers: { default: new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D0E8', space: 4 } }, spacing: { before: 0 }, children: [new TextRun({ text: 'Generated by OrgOS  •  AI-Powered Organization Operating System', color: GREY_COLOR, size: 16, font: 'Arial' })] })] }) }, children }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = (meeting.name || 'meeting').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.href = url; link.download = `${safeName}_report.docx`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      toast.dismiss(loadingToast); toast.success('DOCX exported!');
    } catch (err) {
      console.error('DOCX export failed:', err); toast.dismiss(loadingToast); toast.error('DOCX export failed. Please try again.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready': return 'bg-green-500/20 text-green-400';
      case 'processing': return 'bg-yellow-500/20 text-yellow-400';
      case 'scheduled': return 'bg-blue-500/20 text-blue-400';
      case 'live': return 'bg-red-500/20 text-red-400';
      case 'cancelled': return 'bg-red-900/20 text-red-700';
      case 'completed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getDomainColor = (domain) => {
    const colors = {
      'Sprint Planning': 'bg-blue-500/20 text-blue-400',
      'Performance Review': 'bg-green-500/20 text-green-400',
      'Architecture Discussion': 'bg-purple-500/20 text-purple-400',
      '1:1': 'bg-yellow-500/20 text-yellow-400',
      'All-Hands': 'bg-red-500/20 text-red-400',
      'Custom': 'bg-muted text-muted-foreground'
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
            <Button variant="ghost" size="icon" onClick={() => router.push('/meetings/history')}><ArrowLeft className="h-5 w-5" /></Button>
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
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Meeting not found</p>
          <Button className="mt-4" onClick={() => router.push('/meetings/history')}>Back to Meetings</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {showEndConfirm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4">
              <h2 className="text-lg font-semibold mb-2 text-foreground">End this meeting?</h2>
              <p className="text-muted-foreground text-sm mb-6">This will end the meeting for all participants and cannot be undone.</p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowEndConfirm(false)} className="border-border text-foreground hover:bg-muted">Cancel</Button>
                <Button onClick={handleEndMeeting} disabled={isEnding} className="bg-red-600 hover:bg-red-700">
                  {isEnding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Yes, end meeting
                </Button>
              </div>
            </div>
          </div>
        )}

        {meeting.status === 'cancelled' && (
          <div className="bg-destructive/20 border border-destructive/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-destructive text-sm">This meeting has been cancelled by the host.</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/meetings/history')}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{meeting.name}</h1>
                <Badge className={getStatusColor(meeting.status)}>{meeting.status}</Badge>
              </div>
              <p className="text-muted-foreground">{meeting.description}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isReady && (<Button variant="outline" onClick={handleExportPDF} className="border-border text-foreground hover:bg-muted"><Download className="mr-2 h-4 w-4" />Export PDF</Button>)}
            {isReady && (<Button variant="outline" onClick={handleExportDOCX} className="border-border text-foreground hover:bg-muted"><FileDown className="mr-2 h-4 w-4" />Export DOCX</Button>)}
            {meeting.status === 'scheduled' && (<Button onClick={() => router.push(`/meetings/${meeting._id}/room`)} className="bg-green-600 hover:bg-green-700"><Mic className="mr-2 h-4 w-4" />Join Meeting</Button>)}
            {meeting.status === 'live' && (<Button onClick={() => router.push(`/meetings/${meeting._id}/room`)} className="bg-green-600 hover:bg-green-700"><Mic className="mr-2 h-4 w-4" />Rejoin Meeting</Button>)}
            {(meeting.status === 'live' || meeting.status === 'scheduled') && isHost && (
              <Button onClick={() => setShowEndConfirm(true)} disabled={isEnding} className="bg-red-600 hover:bg-red-700">
                {isEnding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <StopCircle className="mr-2 h-4 w-4" />}
                End Meeting
              </Button>
            )}
            {['ready', 'completed', 'processing'].includes(meeting.status) && (
              <Button variant="outline" className="border-border text-foreground hover:bg-muted" onClick={() => setActiveTab('summary')}><FileText className="mr-2 h-4 w-4" />View Summary</Button>
            )}
            {isReady && (<Button onClick={() => router.push(`/meetings/${meeting._id}/schedule-followup`)} className="bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" />Schedule Follow-up</Button>)}
          </div>
        </div>

        {isProcessing && processingStatus && (
          <Card className="bg-card border-muted border-yellow-500/30">
            <CardContent className="py-6">
              <ProcessingStepIndicator processingSteps={processingStatus.processingSteps} error={processingStatus.error} />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-muted"><CardContent className="flex items-center gap-3 py-4"><Calendar className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Date</p><p className="font-medium">{format(new Date(meeting.scheduledDate), 'MMM d, yyyy')}</p></div></CardContent></Card>
          <Card className="bg-card border-muted"><CardContent className="flex items-center gap-3 py-4"><Clock className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Duration</p><p className="font-medium">{meeting.actualDuration || meeting.estimatedDuration || 0} min</p></div></CardContent></Card>
          <Card className="bg-card border-muted"><CardContent className="flex items-center gap-3 py-4"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Attendees</p><p className="font-medium">{meeting.attendees?.length || 0}</p></div></CardContent></Card>
          <Card className="bg-card border-muted"><CardContent className="flex items-center gap-3 py-4"><Mic className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Type</p><Badge className={getDomainColor(meeting.domain)}>{meeting.domain}</Badge></div></CardContent></Card>
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

              <TabsContent value="summary">
                <MeetingSummaryPanel meeting={meeting} isProcessing={isProcessing} />
              </TabsContent>

              <TabsContent value="transcript">
                <Card className="bg-card border-muted">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Transcript</CardTitle>
                      {transcriptHasChanges && (
                        <Button size="sm" onClick={handleSaveTranscript} disabled={isSavingTranscript} className="bg-blue-600 hover:bg-blue-700">
                          {isSavingTranscript && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                          {isSavingTranscript ? 'Saving...' : 'Save corrections'}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {transcriptSegments.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground mb-3">AI has assigned speakers. Click any name to correct it.</p>
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-3 pr-2">
                            {/* ── FIX: Group consecutive same-speaker segments into one dialogue box ── */}
                            {(() => {
                              const groups = [];
                              transcriptSegments.forEach((seg, i) => {
                                const prev = groups[groups.length - 1];
                                if (prev && prev.speaker === seg.speaker) {
                                  prev.texts.push({ text: seg.text, idx: i });
                                } else {
                                  groups.push({
                                    speaker: seg.speaker,
                                    startTime: seg.startTime,
                                    firstIdx: i,
                                    texts: [{ text: seg.text, idx: i }]
                                  });
                                }
                              });
                              return groups.map((group, gi) => (
                                <div key={gi} className="p-3 bg-muted/50 rounded-lg group">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    {editingSegmentIdx === group.firstIdx ? (
                                      <div className="flex items-center gap-1">
                                        <select
                                          autoFocus
                                          defaultValue={group.speaker}
                                          onChange={(e) => {
                                            // Correct all segments in this group at once
                                            group.texts.forEach(t => handleSpeakerChange(t.idx, e.target.value));
                                          }}
                                          className="text-sm bg-background border border-border rounded px-2 py-0.5 text-foreground focus:outline-none"
                                        >
                                          {attendeeNameList.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                          ))}
                                          <option value="Unknown Speaker">Unknown Speaker</option>
                                        </select>
                                        <button onClick={() => setEditingSegmentIdx(null)} className="text-muted-foreground hover:text-foreground ml-1">
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setEditingSegmentIdx(group.firstIdx)}
                                        className={`flex items-center gap-1 font-medium text-sm hover:opacity-80 ${speakerColorMap[group.speaker] || 'text-muted-foreground'}`}
                                        title="Click to correct speaker"
                                      >
                                        {group.speaker}
                                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                                      </button>
                                    )}
                                    <span className="text-xs text-muted-foreground">{formatTime(group.startTime)}</span>
                                  </div>
                                  {/* All sentences joined — one readable paragraph per speaker turn */}
                                  <p className="text-foreground text-sm leading-relaxed">
                                    {group.texts.map(t => t.text).join(' ')}
                                  </p>
                                </div>
                              ));
                            })()}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : meeting?.transcriptRaw ? (
                      <ScrollArea className="h-[400px]">
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-2">Speaker detection not available — showing raw transcript.</p>
                          <p className="text-foreground whitespace-pre-wrap text-sm">{meeting.transcriptRaw}</p>
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-muted-foreground">{isProcessing ? 'Transcript will be available after processing...' : 'No transcript available'}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="attendees">
                <Card className="bg-card border-muted">
                  <CardHeader><CardTitle>Attendees</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {meeting.attendees?.map((attendee) => (
                        <AttendeeContributionCard key={attendee.user?._id || attendee._id} attendee={attendee} contributions={meeting.attendeeContributions} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="action-items">
                <Card className="bg-card border-muted">
                  <CardHeader><CardTitle className="flex items-center gap-2"><CheckSquare className="h-5 w-5" />Action Items</CardTitle></CardHeader>
                  <CardContent>
                    {meeting.actionItems?.length > 0 ? (
                      <div className="space-y-3">
                        {meeting.actionItems.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                            <div className="mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${item.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-border'}`}>
                                {item.status === 'completed' && <CheckSquare className="h-3 w-3 text-white" />}
                              </div>
                            </div>
                            <div className="flex-1">
                              <p className={item.status === 'completed' ? 'line-through text-muted-foreground' : ''}>{item.task}</p>
                              {item.owner && <p className="text-sm text-muted-foreground">Assigned to: {item.owner.firstName} {item.owner.lastName}</p>}
                              {item.deadline && <p className="text-sm text-muted-foreground">Due: {format(new Date(item.deadline), 'MMM d, yyyy')}</p>}
                            </div>
                            <Badge className={item.status === 'completed' ? 'bg-green-500/20 text-green-400' : item.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}>
                              {item.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No action items extracted</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <MeetingQAPanel meetingId={meeting._id} meetingName={meeting.name} />
            <SimilarMeetingsPanel meetingId={meeting._id} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}