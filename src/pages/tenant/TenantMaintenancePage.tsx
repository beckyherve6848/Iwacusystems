import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Plus, Wrench } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';

const statusColors: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-700 border-amber-700/50',
  approved:    'bg-blue-50 text-blue-700 border-blue-700/50',
  in_progress: 'bg-violet-50 text-violet-700 border-violet-700/50',
  completed:   'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  rejected:    'bg-red-50 text-red-700 border-red-700/50',
};

const priorityColors: Record<string, string> = {
  low:    'bg-slate-100/50 text-slate-700',
  medium: 'bg-amber-50 text-amber-700',
  high:   'bg-red-50 text-red-700',
};

const panelStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e9ecef',
  borderRadius: '1rem',
  padding: '1.25rem',
};

export default function TenantMaintenancePage() {
  const { user } = useAuth();
  const { t, language } = useTheme();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });
  const { toasts, addToast, removeToast } = useToast();

  const loadRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, house_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (tenantError) {
      addToast(tenantError.message, 'error');
      setLoading(false);
      return;
    }
    if (!tenant) {
      setTenantId(null);
      setHouseId(null);
      setRequests([]);
      setLoading(false);
      return;
    }
    setTenantId(tenant.id);
    setHouseId(tenant.house_id);
    const { data: reqs, error } = await supabase
      .from('maintenance_requests')
      .select('*, houses(house_number)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });
    if (error) addToast(error.message, 'error');
    else setRequests(reqs ?? []);
    setLoading(false);
  }, [user, addToast]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tenant-maintenance-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { void loadRequests(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadRequests]);

  const submitRequest = async () => {
    if (!tenantId || !form.title.trim() || !form.description.trim()) {
      addToast(t('titleDescRequired'), 'error');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('maintenance_requests').insert({
      tenant_id: tenantId,
      house_id: houseId,
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
    });
    if (error) {
      addToast(error.message, 'error');
      setSaving(false);
      return;
    }
    addToast(t('maintenanceSubmitted'), 'success');
    setRequestModalOpen(false);
    setForm({ title: '', description: '', priority: 'medium' });
    await loadRequests();
    setSaving(false);
  };

  const activeRequests = requests.filter(r => r.status !== 'completed' && r.status !== 'rejected');
  const displayed = filter === 'active' ? activeRequests : requests;

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {language === 'fr' ? 'Mes Demandes de Maintenance' : 'My Maintenance Requests'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {language === 'fr' ? 'Suivez le statut de vos demandes' : 'Track the status of your submitted requests'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
          {activeRequests.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <Wrench className="h-4 w-4" style={{ color: '#111827' }} />
              <span className="text-sm font-bold" style={{ color: '#111827' }}>{activeRequests.length}</span>
              <span className="text-xs text-slate-500">
                {language === 'fr' ? 'en cours' : 'ongoing'}
              </span>
            </div>
          )}
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setRequestModalOpen(true)} disabled={!tenantId}>
            {t('maintenanceRequest')}
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['active', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f ? 'text-[#f7f8fa]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            style={filter === f ? {
              background: 'linear-gradient(135deg,#fdb022,#f59e0b)',
              boxShadow: '0 4px 12px rgba(245,158,11,0.25)',
            } : { background: '#ffffff', border: '1px solid #e9ecef' }}
          >
            {f === 'active'
              ? (language === 'fr' ? `En cours (${activeRequests.length})` : `Active (${activeRequests.length})`)
              : (language === 'fr' ? `Toutes (${requests.length})` : `All (${requests.length})`)}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && displayed.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={panelStyle}>
          <Wrench className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">
            {filter === 'active'
              ? (language === 'fr' ? 'Aucune demande en cours' : 'No active requests')
              : (language === 'fr' ? 'Aucune demande encore' : 'No maintenance requests yet')}
          </p>
          {filter === 'active' && requests.length > 0 && (
            <button onClick={() => setFilter('all')} className="text-sm mt-2 transition-colors" style={{ color: '#111827' }}>
              {language === 'fr' ? 'Voir toutes les demandes' : 'View all requests'}
            </button>
          )}
          {requests.length === 0 && (
            <p className="text-slate-500 text-sm mt-1">
              {language === 'fr' ? 'Utilisez le bouton « Demande de Maintenance » pour soumettre une demande.' : 'Use the Maintenance Request button to submit a request.'}
            </p>
          )}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {displayed.map(r => (
          <div key={r.id} className="rounded-2xl p-5 transition-all" style={{
            background: '#ffffff',
            border: `1px solid ${r.status === 'completed' ? 'rgba(16,185,129,0.2)' : r.status === 'rejected' ? 'rgba(239,68,68,0.2)' : '#e9ecef'}`,
          }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900">{r.title}</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{r.description}</p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[r.status] ?? 'bg-slate-100 text-slate-500 border-slate-600'}`}>
                  {r.status.replace('_', ' ')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[r.priority] ?? 'bg-slate-100 text-slate-500'}`}>
                  {r.priority} priority
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{r.houses?.house_number}</span>
              <span>{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.admin_notes && (
              <div className="mt-3 p-3 rounded-xl" style={{ background: '#f9fafb', border: '1px solid #e9ecef' }}>
                <p className="text-xs text-slate-500 mb-1">
                  {language === 'fr' ? 'Notes de l\'administrateur' : 'Admin Notes'}:
                </p>
                <p className="text-sm text-slate-700">{r.admin_notes}</p>
              </div>
            )}
            {r.assigned_to && (
              <p className="text-xs text-slate-500 mt-2">
                {language === 'fr' ? 'Assigné à' : 'Assigned to'}: <span className="text-slate-700">{r.assigned_to}</span>
              </p>
            )}
          </div>
        ))}
      </div>

      <Modal open={requestModalOpen} onClose={() => setRequestModalOpen(false)} title={t('submitMaintenance')}>
        <div className="space-y-4">
          <Input label={t('titleRequired')} placeholder={t('leakingTapPlaceholder')} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={120} />
          <Textarea label={t('descRequired')} placeholder={t('descPlaceholder')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} maxLength={4000} />
          <Select label={t('priority')} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            <option value="low">{t('low')}</option>
            <option value="medium">{t('medium')}</option>
            <option value="high">{t('high')}</option>
          </Select>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRequestModalOpen(false)}>{t('cancel')}</Button>
          <Button loading={saving} onClick={submitRequest}>{t('submitMaintenance')}</Button>
        </div>
      </Modal>
    </div>
  );
}
