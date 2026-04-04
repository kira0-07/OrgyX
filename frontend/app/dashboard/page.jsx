'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AuthGuard } from '@/components/guards/RouteGuard';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import KPIWidget from '@/components/shared/KPIWidget';
import EmployeeAnalyticsCard from '@/components/shared/EmployeeAnalyticsCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle, Bell, ArrowRight, LayoutDashboard, Target, Users } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/axios';

// Mock sparkline data for KPIs
const sparklinePerformance = [65, 68, 74, 76, 80, 84, 82]; 
const sparklineTasks = [12, 10, 8, 4, 2, 0];
const sparklineAttendance = [95, 96, 98, 97, 99, 100];

function DashboardContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await api.get('/dashboard');
        setDashboardData(response.data.dashboard);
      } catch (error) {
        console.error('Failed to fetch dashboard:', error);
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (isDataLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-[80vh] items-center justify-center">
          <div className="animate-pulse-slow flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Loading Workspace</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── ADMIN gets their own dashboard ──────────────────────────────────────────
  if (user?.isAdmin) {
    return (
      <DashboardLayout>
        <AdminDashboard />
      </DashboardLayout>
    );
  }
  // ────────────────────────────────────────────────────────────────────────────

  const performance = dashboardData?.performance;
  const trend = performance?.trend || 'neutral';
  
  // Data processing for KPIs
  const score = performance?.currentScore || 0;
  const meetingsCount = dashboardData?.upcomingMeetings?.length || 0;
  const tasksCount = dashboardData?.pendingTasks?.length || 0;
  const isSuperior = user?.roleLevel <= 5;

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1 text-foreground flex items-center gap-2">
              Welcome back, {user?.firstName} <span className="text-2xl animate-wave">👋</span>
            </h1>
            <p className="text-muted-foreground font-medium">
              {user?.role} <span className="opacity-50 mx-1">•</span> {isSuperior ? 'Manager Workspace' : 'Personal Workspace'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-surface/50 border border-border px-4 py-2 rounded-full shadow-sm">
            <Calendar className="w-4 h-4" />
            <span>{format(new Date(), 'EEEE, MMMM do, yyyy')}</span>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
          <KPIWidget 
            icon={Target}
            title="Performance Score"
            value={`${score}/100`}
            trend={trend === 'improving' ? 'up' : trend === 'declining' ? 'down' : 'neutral'}
            trendValue={trend === 'improving' ? '+4%' : trend === 'declining' ? '-2%' : '0%'}
            sparklineData={sparklinePerformance}
          />
          <KPIWidget 
            icon={CheckCircle}
            title="Pending Tasks"
            value={tasksCount}
            trend={tasksCount > 5 ? 'up' : 'down'}
            trendValue={tasksCount > 5 ? '+2' : '-3'}
            sparklineData={sparklineTasks}
          />
          <KPIWidget 
            icon={Calendar}
            title="Upcoming Meetings"
            value={meetingsCount}
            trend="neutral"
            trendValue="Next 7 Days"
          />
          {isSuperior && dashboardData?.team ? (
            <KPIWidget 
              icon={Users}
              title="Team Attendance"
              value={`${Math.round((dashboardData.team.attendance?.present || 0) / (dashboardData.team.attendance?.total || 1) * 100)}%`}
              trend="up"
              trendValue="Optimal"
              sparklineData={sparklineAttendance}
            />
          ) : (
            <KPIWidget 
              icon={Bell}
              title="Active Alerts"
              value={dashboardData?.unreadNotifications || 0}
              trend="neutral"
              trendValue="Unread"
            />
          )}
        </div>

        {/* Workspace Body */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Recent/Upcoming Meetings */}
          <Card className="flex flex-col h-[400px]">
            <CardHeader className="border-b border-border/50 bg-surface/30 pb-4">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Calendar className="h-4 w-4" />
                  </div>
                  Workspace Schedule
                </div>
                <Badge variant="outline" className="font-normal text-xs text-muted-foreground border-border bg-surface">This week</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0">
              {!dashboardData?.upcomingMeetings?.length ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-70">
                  <Calendar className="h-12 w-12 mb-3 stroke-1" />
                  <p className="text-sm">No upcoming meetings scheduled.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {dashboardData.upcomingMeetings.slice(0, 5).map((meeting) => (
                    <div
                      key={meeting._id}
                      className="group flex items-center justify-between p-4 hover:bg-surface-hover/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/meetings/${meeting._id}`)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-2 h-2 rounded-full bg-primary ring-4 ring-primary/10" />
                        <div>
                          <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{meeting.name}</p>
                          <p className="text-xs text-muted-foreground/80 mt-1 uppercase tracking-wider font-semibold">
                            {format(new Date(meeting.scheduledDate), 'MMM d, yyyy • h:mm a')}
                          </p>
                        </div>
                      </div>
                      <Badge variant={meeting.status === 'live' ? 'rag-red' : 'outline'} className="shadow-none">
                        {meeting.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Items / Tasks */}
          <Card className="flex flex-col h-[400px]">
            <CardHeader className="border-b border-border/50 bg-surface/30 pb-4">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-green-500/10 text-green-500">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  Action Items
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
              {!dashboardData?.pendingTasks?.length ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-70">
                  <CheckCircle className="h-12 w-12 mb-3 stroke-1" />
                  <p className="text-sm">Inbox zero. All caught up.</p>
                </div>
              ) : (
                dashboardData.pendingTasks.slice(0, 5).map((task) => (
                  <div
                    key={task._id}
                    className="group flex items-center justify-between p-3 rounded-lg border border-border/50 bg-surface/50 hover:bg-surface-hover hover:border-primary/30 cursor-pointer transition-all"
                    onClick={() => router.push('/tasks')}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-4 h-4 rounded border-2 border-muted-foreground/30 group-hover:border-primary/50 transition-colors" />
                      <div className="truncate">
                        <p className="font-medium text-sm truncate">{task.title}</p>
                        {task.dueDate && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Due {format(new Date(task.dueDate), 'MMM d')}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={
                      task.priority === 'urgent' ? 'rag-red' :
                      task.priority === 'high' ? 'rag-amber' : 'kpi'
                    } className="ml-2 shrink-0">
                      {task.priority}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Manager Insights / Team Overview */}
        {isSuperior && dashboardData?.team && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold tracking-tight">Team Analytics</h2>
              <button 
                onClick={() => router.push('/team')}
                className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                View Directory <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-6">
              {/* Highlight At-Risk Employees first */}
              {dashboardData.team.atRiskEmployees?.slice(0, 3).map((rec) => (
                <EmployeeAnalyticsCard 
                  key={rec._id}
                  employee={rec.user}
                  score={Math.round((1 - (rec.resignationRiskScore || 0)) * 100)} // Inverse mapping for score
                  trend="declining"
                  riskLevel="high"
                />
              ))}
              
              {/* Then show others if there's room */}
              {dashboardData.team.members?.slice(0, Math.max(0, 3 - (dashboardData.team.atRiskEmployees?.length || 0))).map((member) => (
                <EmployeeAnalyticsCard 
                  key={member._id}
                  employee={member}
                  score={85 + Math.floor(Math.random() * 10)} // Mocked score for UI
                  trend="improving"
                  riskLevel="low"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}