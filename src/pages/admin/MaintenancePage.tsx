import React, { useEffect, useState, useCallback } from 'react';
import { Search, Pencil, Trash2 } from 'lucide-react';
import { supabase, MaintenanceRequest } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';

const PER_PAGE = 10;

const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-700/50',
  approved: 'bg-blue-50 text-blue-700 border-blue-700/50',
  in_progress: 'bg-violet-50 text-violet-700 border-violet-700/50',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  rejected: 'bg-red-50 text-red-700 border-red-700/50',
};

const priorityColors: Record<string, string> = {
  low: 'bg-slate-100/50 text-slate-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
};

export default function MaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('maintenance_requests')
      .select('*, tenants(full_name, tenant_code), houses(house_number)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) q = q.ilike('title', `%${search}%`);
    if (filterStatus) q = q.eq('status', filterStatus);

    const from = (page - 1) * PER_PAGE;
    q = q.range(from, from + PER_PAGE - 1);

    const { data, count, error } = await q;
    if (error) {
      addToast(`Unable to load maintenance requests: ${error.message}`, 'error');
    } else {
      setRequests(data ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [addToast, page, search, filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('maintenance-request-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_requests' }, () => {
        void load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const openEdit = (r: MaintenanceRequest) => {
    setEditing(r);
    setAdminNotes(r.admin_notes ?? '');
    setAssignedTo(r.assigned_to ?? '');
    setNewStatus(r.status);
    setEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from('maintenance_requests')
      .update({ status: newStatus, admin_notes: adminNotes, assigned_to: assignedTo, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) addToast(error.message, 'error');
    else {
      let notificationError: string | null = null;
      if (newStatus !== editing.status) {
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('user_id')
          .eq('id', editing.tenant_id)
          .maybeSingle();
        if (tenantError) {
          notificationError = tenantError.message;
        } else if (tenant?.user_id) {
          const { error: insertError } = await supabase.from('notifications').insert({
            user_id: tenant.user_id,
            maintenance_request_id: editing.id,
            title: 'Maintenance request updated',
            message: `Your request "${editing.title}" is now ${newStatus.replace('_', ' ')}.${adminNotes.trim() ? ` Note: ${adminNotes.trim()}` : ''}`,
            type: newStatus === 'rejected' ? 'warning' : 'info',
            link: 'tenant-maintenance',
          });
          if (insertError) notificationError = insertError.message;
        }
      }
      addToast(
        notificationError
          ? `Request updated, but the tenant could not be notified: ${notificationError}`
          : 'Request updated',
        notificationError ? 'warning' : 'success',
      );
      setEditModal(false);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('maintenance_requests').delete().eq('id', deleteId);
    if (error) addToast(error.message, 'error');
    else { addToast('Request deleted', 'success'); load(); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Maintenance Requests</h1>
          <p className="text-slate-500 text-sm mt-0.5">Review and manage tenant maintenance requests</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input placeholder="Search by title..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Request</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Tenant</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Date</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="text-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>}
              {!loading && requests.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No maintenance requests</td></tr>}
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900 text-sm">{r.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{r.description}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm text-slate-900">{(r.tenants as any)?.full_name}</p>
                    <p className="text-xs text-slate-500">{(r.houses as any)?.house_number}</p>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium capitalize ${priorityColors[r.priority]}`}>{r.priority}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[r.status]}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteId(r.id)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-5 py-3">
          <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Request" size="sm">
        <p className="text-slate-700 mb-2">Are you sure you want to permanently delete this maintenance request?</p>
        <p className="text-red-400 text-sm mb-6">This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Update Maintenance Request" size="md">
        {editing && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4">
              <p className="font-semibold text-slate-900 mb-1">{editing.title}</p>
              <p className="text-sm text-slate-500">{editing.description}</p>
              <div className="flex gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[editing.priority]}`}>{editing.priority} priority</span>
                <span className="text-xs text-slate-500">{(editing.tenants as any)?.full_name} · {(editing.houses as any)?.house_number}</span>
              </div>
            </div>
            <Select label="Update Status" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </Select>
            <Input label="Assign To" placeholder="Technician name or team" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} />
            <Textarea label="Admin Notes" placeholder="Notes for tenant or internal notes..." value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3} />
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setEditModal(false)}>Cancel</Button>
          <Button loading={saving} onClick={handleUpdate}>Update Request</Button>
        </div>
      </Modal>
    </div>
  );
}
