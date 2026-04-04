'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Filter,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Search,
  ArrowRight
} from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import RecommendationCard from '@/components/shared/RecommendationCard';
import { CardSkeleton, ListSkeleton } from '@/components/shared/Skeleton';
import toast from 'react-hot-toast';

export default function RecommendationsPage() {
  const router = useRouter();
  const { isSuperior } = useAuth();
  const [recommendations, setRecommendations] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchRecommendations();
    if (isSuperior) {
      fetchStats();
    }
  }, [page, filter]);

  const fetchRecommendations = async () => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('page', page);
      queryParams.append('limit', 20);
      if (filter !== 'all') {
        queryParams.append('category', filter);
      }
      if (search) {
        queryParams.append('search', search);
      }

      const response = await api.get(`/recommendations?${queryParams.toString()}`);
      setRecommendations(response.data.recommendations || []);
      setTotalPages(response.data.pagination?.pages || 1);
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
      toast.error('Failed to fetch recommendations');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/recommendations/stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const filteredRecommendations = recommendations.filter(rec =>
    !search ||
    rec.user?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    rec.user?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
    rec.reasoning?.toLowerCase().includes(search.toLowerCase())
  );

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'promote':
        return <TrendingUp className="h-5 w-5 text-green-500" />;
      case 'at_risk':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'monitor':
        return <TrendingDown className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Recommendations</h1>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <ListSkeleton count={5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Recommendations</h1>
            <p className="text-muted-foreground">AI-powered insights about your team</p>
          </div>
        </div>

        {/* Stats */}
        {isSuperior && stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-card border-muted">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <TrendingUp className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.byCategory?.find(s => s._id === 'promote')?.count || 0}</p>
                  <p className="text-sm text-muted-foreground">Promote</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-muted">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.byCategory?.find(s => s._id === 'at_risk')?.count || 0}</p>
                  <p className="text-sm text-muted-foreground">At Risk</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-muted">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <TrendingDown className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.byCategory?.find(s => s._id === 'monitor')?.count || 0}</p>
                  <p className="text-sm text-muted-foreground">Monitor</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-muted">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.byStatus?.find(s => s._id === 'pending')?.count || 0}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="bg-card border-muted">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search recommendations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-muted border-border"
                />
              </div>
              <div className="flex gap-2">
                {['all', 'promote', 'at_risk', 'monitor'].map((f) => (
                  <Button
                    key={f}
                    variant={filter === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter(f)}
                    className={filter === f ? '' : 'border-border'}
                  >
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recommendations List */}
        <Card className="bg-card border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Recommendations
              <Badge variant="secondary" className="ml-auto">
                {filteredRecommendations.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredRecommendations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No recommendations found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRecommendations.map((rec) => (
                  <RecommendationCard
                    key={rec._id}
                    recommendation={rec}
                    onUpdate={fetchRecommendations}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border-slate-700"
                >
                  Previous
                </Button>
                <span className="py-2 text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="border-slate-700"
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
