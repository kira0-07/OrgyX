'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, Settings, Shield, TrendingUp,
  ArrowRight, Activity, Database,
  AlertTriangle, CheckCircle, UserPlus
} from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/axios';
import { CardSkeleton } from '@/components/shared/Skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSystemStats();
    fetchAuditLogs();
  }, []);

  const fetchSystemStats = async () => {
    try {
      const response = await api.get('/admin/system-stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/audit?limit=5');
      setAuditLogs(response.data.logs || []);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const systemMetrics = [
    { name: 'CPU',     value: stats?.cpu     ?? 45, color: '#3b82f6' },
    { name: 'Memory',  value: stats?.memory  ?? 62, color: '#10b981' },
    { name: 'Storage', value: stats?.storage ?? 78, color: '#f59e0b' },
  ];

  const userRoleData = stats?.usersByRole || [
    { role: 'Engineers', count: 0 },
    { role: 'Managers',  count: 0 },
    { role: 'Leads',     count: 0 },
    { role: 'QA',        count: 0 },
  ];

  const getActionColor = (action) => {
    if (action?.includes('delete') || action?.includes('remove')) return 'bg-red-500/20 text-red-400';
    if (action?.includes('create') || action?.includes('add'))    return 'bg-green-500/20 text-green-400';
    if (action?.includes('update') || action?.includes('edit'))   return 'bg-blue-500/20 text-blue-400';
    return 'bg-slate-500/20 text-muted-foreground';
  };

  const quickActions = [
    { label: 'Manage Users',      icon: Users,    href: '/admin/users',   color: 'bg-blue-500/20 text-blue-400' },
    { label: 'Prompt Templates',  icon: Settings, href: '/admin/prompts', color: 'bg-green-500/20 text-green-400' },
    { label: 'System Stats',      icon: Database, href: '/admin/system',  color: 'bg-purple-500/20 text-purple-400' },
    { label: 'Audit Logs',        icon: Shield,   href: '/audit',         color: 'bg-yellow-500/20 text-yellow-400' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── Welcome Header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1 text-foreground">Global Control Center</h1>
        <p className="text-muted-foreground font-medium">System Administration · Infrastructure Health</p>
      </div>

      {/* ── Top Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-surface border-border flex flex-col p-5 card-elevated">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary"><Users className="h-6 w-6" /></div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Users</p>
              <div className="text-2xl font-bold mt-0.5">{stats?.users || 0}</div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {stats?.activeUsers || 0} currently active
          </div>
        </Card>

        <Card className="bg-surface border-border flex flex-col p-5 card-elevated">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-xl text-green-500"><UserPlus className="h-6 w-6" /></div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">New This Month</p>
              <div className="text-2xl font-bold mt-0.5">{stats?.newUsersThisMonth || 0}</div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-green-500 font-medium">
            +14% from last month
          </div>
        </Card>

        <Card className="bg-surface border-border flex flex-col p-5 card-elevated">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/10 rounded-xl text-red-500"><AlertTriangle className="h-6 w-6" /></div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">At Risk</p>
              <div className="text-2xl font-bold mt-0.5">{stats?.atRiskUsers || 0}</div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-red-500 font-medium">
            Requires intervention
          </div>
        </Card>

        <Card className="bg-surface border-border flex flex-col p-5 card-elevated">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500"><Shield className="h-6 w-6" /></div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Admins</p>
              <div className="text-2xl font-bold mt-0.5">{stats?.adminUsers || 0}</div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            System administrators
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── User Distribution Chart ── */}
        <Card className="bg-card border-muted lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Users by Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userRoleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="role" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="count" fill="#6C63FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ── System Health ── */}
        <Card className="bg-card border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {systemMetrics.map((metric) => (
                <div key={metric.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">{metric.name}</span>
                    <span className="text-sm font-medium">{metric.value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${metric.value}%`, backgroundColor: metric.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Service status */}
            <div className="mt-6 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Services</p>
              {[
                { label: 'MongoDB',  ok: stats?.mongoConnected  ?? true },
                { label: 'Redis',    ok: stats?.redisConnected  ?? true },
                { label: 'ChromaDB', ok: stats?.chromaConnected ?? true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <div className={`flex items-center gap-1 text-xs font-medium ${ok ? 'text-green-400' : 'text-red-400'}`}>
                    <div className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
                    {ok ? 'Online' : 'Offline'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Quick Actions ── */}
        <Card className="bg-card border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="ghost"
                  className="h-auto flex flex-col items-center gap-2 p-4 hover:bg-muted"
                  onClick={() => router.push(action.href)}
                >
                  <div className={`p-2 rounded-lg ${action.color}`}>
                    <action.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs text-center">{action.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Recent Audit Logs ── */}
        <Card className="bg-card border-muted lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Recent Audit Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No recent audit logs</p>
              </div>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div
                    key={log._id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${getActionColor(log.action)}`}>
                        <Shield className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {log.user?.firstName} {log.user?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{log.action}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                      </p>
                      <Badge className={log.success
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                      }>
                        {log.success ? 'Success' : 'Failed'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full mt-4 text-muted-foreground hover:text-foreground"
              onClick={() => router.push('/audit')}
            >
              View All Logs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}