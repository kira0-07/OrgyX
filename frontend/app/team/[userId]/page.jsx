'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Mail, Phone, Calendar,
  TrendingUp, TrendingDown, Minus,
  Users, Activity, Award
} from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/axios';
import { CardSkeleton } from '@/components/shared/Skeleton';
import AttendanceHeatmap from '@/components/shared/AttendanceHeatmap';
import RecommendationCard from '@/components/shared/RecommendationCard';
import toast from 'react-hot-toast';

export default function UserDetailPage({ params }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, [params?.userId]);

  const fetchUserData = async () => {
    if (!params?.userId) return;
    try {
      const [userResponse, teamResponse, recommendationsResponse] = await Promise.all([
        api.get(`/users/${params.userId}`),
        api.get(`/users/team/${params.userId}`),
        api.get(`/recommendations?userId=${params.userId}`),
      ]);
      setUser(userResponse.data.user);
      setTeam(teamResponse.data.team);
      setRecommendations(recommendationsResponse.data.recommendations || []);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      toast.error('Failed to fetch user data');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Performance — handle both possible shapes from the API ──────────────────
  const perf = user?.performance;
  const currentScore = perf?.currentScore ?? perf?.score ?? 0;
  const trend = perf?.trend ?? 'neutral';
  const lastReviewDate = perf?.lastReviewDate ?? perf?.updatedAt ?? null;

  const getTrendIcon = () => {
    if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-yellow-500" />;
  };

  const getTrendColor = () => {
    if (trend === 'improving') return 'text-green-500';
    if (trend === 'declining') return 'text-red-500';
    return 'text-yellow-500';
  };

  // Safely parse joinedAt / createdAt
  const joinedDate = user?.joinedAt || user?.createdAt;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardSkeleton className="flex-1" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">User not found</p>
          <Button className="mt-4" onClick={() => router.push('/team')}>Back to Team</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl text-foreground font-semibold">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{user.firstName} {user.lastName}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="bg-muted text-foreground">{user.role}</Badge>
                  <span className="text-muted-foreground text-sm">Level {user.roleLevel}</span>
                </div>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-border"
            onClick={() => window.location.href = `mailto:${user.email}`}
          >
            <Mail className="mr-2 h-4 w-4" />
            Send Email
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Performance</p>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-lg">{currentScore}/100</p>
                  <div className={getTrendColor()}>{getTrendIcon()}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Direct Reports</p>
                <p className="font-medium text-lg">{team?.directReports?.length || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Joined</p>
                <p className="font-medium">
                  {joinedDate ? format(new Date(joinedDate), 'MMM yyyy') : 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-muted">
            <CardContent className="flex items-center gap-3 py-4">
              <Award className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={user.isActive
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
                }>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-card border border-muted">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          {/* ── Overview tab ── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <Card className="bg-card border-muted">
                <CardHeader><CardTitle>Performance</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-muted-foreground">Current Score</span>
                      <span className="font-medium">{currentScore}/100</span>
                    </div>
                    <Progress value={currentScore} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Trend</p>
                      <p className={`font-medium capitalize ${getTrendColor()}`}>{trend}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Last Review</p>
                      <p className="font-medium">
                        {lastReviewDate ? format(new Date(lastReviewDate), 'MMM d') : 'N/A'}
                      </p>
                    </div>
                    {perf?.taskCompletionRate !== undefined && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Task Completion</p>
                        <p className="font-medium">{Math.round((perf.taskCompletionRate || 0) * 100)}%</p>
                      </div>
                    )}
                    {perf?.deadlineAdherenceRate !== undefined && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Deadline Adherence</p>
                        <p className="font-medium">{Math.round((perf.deadlineAdherenceRate || 0) * 100)}%</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-muted">
                <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{user.email}</span>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                  {user.timezone && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{user.timezone}</span>
                    </div>
                  )}
                  {user.superior && (
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Reports to</p>
                        <p className="font-medium">
                          {user.superior?.firstName} {user.superior?.lastName}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Attendance tab ── */}
          <TabsContent value="attendance">
            <Card className="bg-card border-muted">
              <CardHeader><CardTitle>Attendance</CardTitle></CardHeader>
              <CardContent>
                {/* Pass userId so heatmap fetches its own data per month */}
                <AttendanceHeatmap userId={params.userId} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Team tab ── */}
          <TabsContent value="team" className="space-y-4">
            <Card className="bg-card border-muted">
              <CardHeader><CardTitle>Direct Reports</CardTitle></CardHeader>
              <CardContent>
                {!team?.directReports?.length ? (
                  <p className="text-muted-foreground text-center py-8">No direct reports</p>
                ) : (
                  <div className="space-y-3">
                    {team.directReports.map((report) => (
                      <div
                        key={report._id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => router.push(`/team/${report._id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-foreground font-medium">
                            {report.firstName?.[0]}{report.lastName?.[0]}
                          </div>
                          <div>
                            <p className="font-medium">{report.firstName} {report.lastName}</p>
                            <p className="text-sm text-muted-foreground">{report.role}</p>
                          </div>
                        </div>
                        <Badge className={report.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                        }>
                          {report.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Recommendations tab ── */}
          <TabsContent value="recommendations" className="space-y-4">
            <Card className="bg-card border-muted">
              <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
              <CardContent>
                {recommendations.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No recommendations yet</p>
                ) : (
                  <div className="space-y-4">
                    {recommendations.slice(0, 5).map((rec) => (
                      <RecommendationCard
                        key={rec._id}
                        recommendation={rec}
                        onUpdate={fetchUserData}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}