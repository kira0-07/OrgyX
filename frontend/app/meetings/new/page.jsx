'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Calendar, Clock, Users, Video, Link2, LayoutGrid, X, CheckCircle2 } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

const meetingDomains = [
  { value: 'Sprint Planning', icon: '🏃', color: 'bg-blue-500/15 text-blue-400' },
  { value: 'Performance Review', icon: '📊', color: 'bg-amber-500/15 text-amber-400' },
  { value: 'Architecture Discussion', icon: '🏗️', color: 'bg-purple-500/15 text-purple-400' },
  { value: '1:1', icon: '👥', color: 'bg-green-500/15 text-green-400' },
  { value: 'All-Hands', icon: '🎯', color: 'bg-red-500/15 text-red-400' },
  { value: 'Custom', icon: '⚡', color: 'bg-muted text-muted-foreground' },
];

export default function NewMeetingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchUsers, setSearchUsers] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scheduledDate: '',
    estimatedDuration: '60',
    domain: '',
    agenda: '',
    externalLink: '',
    attendees: []
  });

  useEffect(() => {
    fetchOrgTreeUsers();
  }, []);

  const fetchOrgTreeUsers = async () => {
    try {
      const response = await api.get('/users?limit=100');
      const allUsers = response.data.users || [];
      const myId = (user?._id || user?.id)?.toString();
      setUsers(allUsers.filter(u => u._id?.toString() !== myId));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error('Failed to load team members');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast.error('Meeting name is required'); return; }
    if (!formData.scheduledDate) { toast.error('Date and time is required'); return; }
    if (!formData.domain) { toast.error('Please select a domain'); return; }

    setIsLoading(true);
    try {
      await api.post('/meetings', {
        ...formData,
        estimatedDuration: parseInt(formData.estimatedDuration),
        attendees: formData.attendees.map(id => ({ user: id }))
      });
      toast.success('Meeting scheduled successfully');
      router.push('/meetings/history');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to schedule meeting');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttendeeChange = (userId) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.includes(userId)
        ? prev.attendees.filter(id => id !== userId)
        : [...prev.attendees, userId]
    }));
  };

  const removeAttendee = (userId) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.filter(id => id !== userId)
    }));
  };

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName} ${u.role}`.toLowerCase()
      .includes(searchUsers.toLowerCase())
  );

  const selectedDomain = meetingDomains.find(d => d.value === formData.domain);

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-10rem)] flex flex-col min-h-[600px]">
        {/* Header */}
        <div className="mb-6 shrink-0 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Schedule a Meeting</h1>
            <p className="text-muted-foreground">Set up a new meeting with your team members</p>
          </div>
          <Badge variant="outline" className="text-[10px] opacity-20 hover:opacity-100 transition-opacity">v1.2-SPLIT</Badge>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
          {/* Left Column (60%) - Scrollable Form Details */}
          <div className="flex-[1.5] overflow-y-auto pr-4 space-y-6 custom-scrollbar">
            {/* Meeting Details Card */}
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4 text-primary" />
                  Meeting Details
                </CardTitle>
                <CardDescription>Basic information about the meeting</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground">Meeting Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="name"
                    placeholder="e.g. Sprint 14 Planning Session"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-foreground">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the meeting objectives..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduledDate" className="text-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      Date & Time <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="scheduledDate"
                      type="datetime-local"
                      value={formData.scheduledDate}
                      onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                      className="bg-muted border-border text-foreground"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimatedDuration" className="text-foreground">Duration (minutes)</Label>
                    <Input
                      id="estimatedDuration"
                      type="number"
                      min="1"
                      value={formData.estimatedDuration}
                      onChange={(e) => setFormData({ ...formData, estimatedDuration: e.target.value })}
                      className="bg-muted border-border text-foreground"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Domain Selection Card */}
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                  Meeting Type
                </CardTitle>
                <CardDescription>Select the domain for this meeting</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {meetingDomains.map((domain) => (
                    <button
                      key={domain.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, domain: domain.value })}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border-2 transition-all duration-200 text-left ${
                        formData.domain === domain.value
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border bg-muted/50 hover:border-muted-foreground/30 hover:bg-muted'
                      }`}
                    >
                      <span className="text-lg">{domain.icon}</span>
                      <span className={`text-sm font-medium ${
                        formData.domain === domain.value ? 'text-primary' : 'text-foreground'
                      }`}>
                        {domain.value}
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Agenda & Link Card */}
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Video className="h-4 w-4 text-primary" />
                  Agenda & Links
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="agenda" className="text-foreground">Agenda</Label>
                  <Textarea
                    id="agenda"
                    value={formData.agenda}
                    onChange={(e) => setFormData({ ...formData, agenda: e.target.value })}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
                    rows={3}
                    placeholder="• Topic 1&#10;• Topic 2&#10;• Topic 3"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="externalLink" className="text-foreground flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    External Link
                    <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                  </Label>
                  <Input
                    id="externalLink"
                    type="url"
                    placeholder="https://zoom.us/j/..."
                    value={formData.externalLink}
                    onChange={(e) => setFormData({ ...formData, externalLink: e.target.value })}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column (40%) - Attendees (Fixed with internal scroll) */}
          <div className="flex-1 flex flex-col h-full min-h-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="pb-4 shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Attendees
                {formData.attendees.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {formData.attendees.length} selected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Select team members to invite</CardDescription>
            </CardHeader>

            <div className="flex-1 flex flex-col min-h-0 px-6 overflow-hidden">
              {/* Selected attendees chips */}
              {formData.attendees.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4 max-h-24 overflow-y-auto pt-1 shrink-0">
                  {formData.attendees.map(id => {
                    const u = users.find(u => u._id === id);
                    if (!u) return null;
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="flex items-center gap-1.5 pr-1 py-1 bg-primary/10 text-primary border-primary/20"
                      >
                        <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </span>
                        {u.firstName} {u.lastName}
                        <button
                          type="button"
                          onClick={() => removeAttendee(id)}
                          className="ml-0.5 p-0.5 hover:bg-primary/30 rounded-full transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div className="relative shrink-0 mb-4">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchUsers}
                  onChange={e => setSearchUsers(e.target.value)}
                  className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {/* User list - Scrollable part of the right column */}
              <div className="flex-1 overflow-y-auto space-y-1 mb-6 custom-scrollbar pr-2">
                {filteredUsers.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8 bg-muted/20 rounded-lg">No team members found</p>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = formData.attendees.includes(u._id);
                    return (
                      <label
                        key={u._id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? 'bg-primary/10 border border-primary/20 shadow-sm'
                            : 'hover:bg-muted border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleAttendeeChange(u._id)}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                        }`}>
                          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />}
                        </div>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0 uppercase">
                            {u.firstName?.[0]}{u.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate uppercase tracking-wider">{u.role}</p>
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer Actions - Sticky within the right column or spanning bottom */}
            <div className="p-6 border-t border-border bg-surface shrink-0 mt-auto">
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="border-border text-foreground hover:bg-muted shrink-0"
                  onClick={() => router.push('/meetings/history')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1 shadow-lg shadow-primary/20">
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scheduling...</>
                  ) : (
                    <>
                      <Calendar className="mr-2 h-4 w-4" />
                      Schedule Meeting
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}