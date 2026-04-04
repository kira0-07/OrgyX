'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Search, UserPlus, Mail, ArrowUpRight, X } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import OrgChart from '@/components/shared/OrgChart';
import { CardSkeleton } from '@/components/shared/Skeleton';
import toast from 'react-hot-toast';

const ALL_ROLES = [
  { name: 'CEO',                     level: 1 },
  { name: 'CTO',                     level: 2 },
  { name: 'VP Engineering',          level: 3 },
  { name: 'Director of Engineering', level: 4 },
  { name: 'Engineering Manager',     level: 5 },
  { name: 'Tech Lead',               level: 6 },
  { name: 'Senior Engineer',         level: 6 },
  { name: 'Software Engineer',       level: 7 },
  { name: 'QA Engineer',             level: 7 },
  { name: 'DevOps Engineer',         level: 7 },
  { name: 'Junior Engineer',         level: 8 },
  { name: 'Intern',                  level: 9 },
];

export default function TeamPage() {
  const router = useRouter();
  const { user, isSuperior, isAdmin } = useAuth();
  const [teamData, setTeamData] = useState(null);
  const [orgChartData, setOrgChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const availableRoles = isAdmin
    ? ALL_ROLES.map(r => r.name)
    : ALL_ROLES.filter(r => r.level > (user?.roleLevel || 0)).map(r => r.name);

  const defaultRole = availableRoles[0] || 'Software Engineer';

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    password: '', role: defaultRole, superior: '',
  });

  useEffect(() => {
    fetchTeamData();
    fetchOrgChart();
  }, []);

  useEffect(() => {
    if (availableRoles.length > 0) {
      setForm(f => ({ ...f, role: availableRoles[0] }));
    }
  }, [user?.roleLevel]);

  const fetchTeamData = async () => {
    try {
      const response = await api.get('/users/team');
      setTeamData(response.data.team);
    } catch (error) {
      toast.error('Failed to fetch team data');
    }
  };

  const fetchOrgChart = async () => {
    try {
      const response = await api.get('/users/org-chart');
      setOrgChartData(response.data.orgChart || []);
    } catch (error) {
      console.error('Failed to fetch org chart');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { toast.error('Name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    if (!form.password || form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (!form.role) { toast.error('Role is required'); return; }

    if (!isAdmin) {
      const selectedRole = ALL_ROLES.find(r => r.name === form.role);
      if (selectedRole && selectedRole.level <= (user?.roleLevel || 0)) {
        toast.error('You can only add members with a lower role than yours');
        return;
      }
    }

    setSubmitting(true);
    try {
      await api.post('/admin/users', {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
        superior: form.superior || user?._id,
      });
      toast.success('Team member added successfully');
      setShowModal(false);
      setForm({ firstName: '', lastName: '', email: '', password: '', role: availableRoles[0] || defaultRole, superior: '' });
      fetchTeamData();
      fetchOrgChart();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add team member');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReports = teamData?.directReports?.filter(member =>
    member.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    member.lastName?.toLowerCase().includes(search.toLowerCase()) ||
    member.role?.toLowerCase().includes(search.toLowerCase()) ||
    member.email?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Team</h1>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><CardSkeleton /></div>
            <div><CardSkeleton /></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Team</h1>
            <p className="text-muted-foreground">Manage your team and view organizational structure</p>
          </div>
          {(isSuperior || isAdmin) && (
            <Button onClick={() => setShowModal(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Team Member
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* Your Manager card — static, not clickable for anyone */}
            {teamData?.superior && (
              <Card className="bg-surface border-border card-elevated">
                <CardHeader className="pb-2 border-b border-border/50">
                  <CardTitle className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground text-center sm:text-left">Reporting To</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-hover/30 border border-border/50">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl border border-primary/20">
                      {teamData.superior.firstName?.[0]}{teamData.superior.lastName?.[0]}
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">
                        {teamData.superior.firstName} {teamData.superior.lastName}
                      </p>
                      <p className="text-sm font-medium text-muted-foreground">{teamData.superior.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-surface border-border card-elevated">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-lg">Direct Reports</CardTitle>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search team members..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 bg-surface border-border focus-visible:ring-1 focus-visible:ring-primary rounded-full h-9 text-sm"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {filteredReports.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="font-medium text-foreground">{search ? 'No team members matching your search' : 'No direct reports allocated yet.'}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredReports.map((member) => {
                      const isActive = member.isActive !== false;
                      return (
                        <div
                          key={member._id}
                          className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border hover:border-primary/50 hover:bg-surface-hover/50 hover:shadow-sm cursor-pointer transition-all group"
                          onClick={() => router.push(`/team/${member._id}`)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                              {member.firstName?.[0]}{member.lastName?.[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{member.firstName} {member.lastName}</p>
                                <ArrowUpRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0" />
                              </div>
                              <p className="text-sm text-muted-foreground font-medium">{member.role}</p>
                              <p className="text-xs text-muted-foreground/70">{member.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={isActive ? 'rag-green' : 'rag-red'} className="hidden sm:inline-flex shadow-none">
                              {isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${member.email}`; }}
                              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full bg-surface border border-border"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-surface border-border card-elevated h-auto flex flex-col">
              <CardHeader className="border-b border-border/50 pb-4">
                <CardTitle className="text-lg">Organization</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 relative min-h-[300px]">
                <div className="absolute inset-0 overflow-hidden bg-surface-hover/20">
                  {orgChartData.length > 0 ? (
                    <OrgChart data={orgChartData} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Users className="w-12 h-12 mb-3 opacity-20" />
                      <span className="font-medium">No active structure</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <div className="p-4 border-t border-border/50 bg-surface/50">
                <Button
                  variant="outline"
                  className="w-full border-border bg-surface hover:bg-surface-hover"
                  onClick={() => router.push('/team/org-chart')}
                >
                  Expand Full Screen Structure
                </Button>
              </div>
            </Card>

            <Card className="bg-surface border-border card-elevated">
              <CardHeader className="border-b border-border/50 pb-3">
                <CardTitle className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" /> Team Health Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="flex justify-between items-center bg-surface-hover/30 p-3 rounded-lg border border-border/50">
                  <span className="text-sm font-semibold text-foreground">Total Members</span>
                  <span className="text-xl font-bold font-mono">{teamData?.directReports?.length || 0}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-surface-hover/30 p-3 rounded-lg border border-border/50 text-center">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Active</p>
                    <p className="text-xl font-bold font-mono text-green-500">
                      {teamData?.directReports?.filter(m => m.isActive !== false).length || 0}
                    </p>
                  </div>
                  <div className="flex-1 bg-surface-hover/30 p-3 rounded-lg border border-border/50 text-center">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Inactive</p>
                    <p className="text-xl font-bold font-mono text-red-500">
                      {teamData?.directReports?.filter(m => m.isActive === false).length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Team Member Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <div className="relative z-50 bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Team Member</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">First Name *</label>
                  <Input
                    placeholder="John"
                    value={form.firstName}
                    onChange={e => setForm({ ...form, firstName: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Last Name *</label>
                  <Input
                    placeholder="Doe"
                    value={form.lastName}
                    onChange={e => setForm({ ...form, lastName: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Email *</label>
                <Input
                  type="email"
                  placeholder="john@company.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="bg-muted border-border"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Password *</label>
                <Input
                  type="password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="bg-muted border-border"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Role * {!isAdmin && <span className="text-xs text-muted-foreground">(roles below your level only)</span>}
                </label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {availableRoles.length > 0 ? (
                    availableRoles.map(r => <option key={r} value={r}>{r}</option>)
                  ) : (
                    <option disabled>No roles available</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 border-border" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddMember}
                disabled={submitting || availableRoles.length === 0}
              >
                {submitting ? 'Adding...' : 'Add Member'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}