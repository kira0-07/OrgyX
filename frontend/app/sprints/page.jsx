'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, BarChart3, X, Calendar } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function SprintsPage() {
  const { isSuperior } = useAuth();
  const [sprints, setSprints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    goal: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchSprints();
  }, []);

  const fetchSprints = async () => {
    try {
      const response = await api.get('/sprints');
      setSprints(response.data.sprints || []);
    } catch (error) {
      toast.error('Failed to fetch sprints');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Sprint name is required'); return; }
    if (!form.startDate) { toast.error('Start date is required'); return; }
    if (!form.endDate) { toast.error('End date is required'); return; }
    if (form.startDate >= form.endDate) { toast.error('End date must be after start date'); return; }

    setSubmitting(true);
    try {
      await api.post('/sprints', {
        name: form.name,
        goal: form.goal,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      toast.success('Sprint created');
      setShowModal(false);
      setForm({ name: '', goal: '', startDate: '', endDate: '' });
      fetchSprints();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create sprint');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-500';
      case 'completed': return 'bg-blue-500/20 text-blue-500';
      case 'planned': return 'bg-yellow-500/20 text-yellow-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Sprints</h1>
          {isSuperior && (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Sprint
            </Button>
          )}
        </div>

        <Card className="bg-card border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Active Sprints
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : sprints.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No sprints found</p>
                {isSuperior && (
                  <Button className="mt-4" onClick={() => setShowModal(true)}>
                    Create your first sprint
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {sprints.map((sprint) => (
                  <div key={sprint._id} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{sprint.name}</p>
                        {sprint.goal && (
                          <p className="text-sm text-muted-foreground mt-1">{sprint.goal}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {sprint.startDate && format(new Date(sprint.startDate), 'MMM d')}
                          {' → '}
                          {sprint.endDate && format(new Date(sprint.endDate), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <Badge className={getStatusColor(sprint.status)}>
                        {sprint.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Sprint Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <div className="relative z-50 bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">New Sprint</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Sprint Name *</label>
                <Input
                  placeholder="e.g. Sprint 1"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="bg-muted border-border"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Goal</label>
                <textarea
                  placeholder="What is the goal of this sprint?"
                  value={form.goal}
                  onChange={e => setForm({ ...form, goal: e.target.value })}
                  className="w-full rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[70px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Start Date *</label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">End Date *</label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 border-border" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Sprint'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}