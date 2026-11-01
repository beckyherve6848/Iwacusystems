import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { Notification } from '@/lib/supabase';
import { Bell, CheckCheck, Plus, Send, Trash2, Users, User, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';

const typeIcons: Record<string, React.ReactNode> = {
  info:    <Info className="w-4 h-4 text-blue-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  success: <CheckCircle className="w-4 h-4 text-emerald-400" />,
  error:   <XCircle className="w-4 h-4 text-red-400" />,
};

const typeBorderColor: Record<string, string> = {
  info:    '#3b82f6',
  warning: '#f59e0b',
  success: '#10b981',
  error:   '#ef4444',
};

const emptyForm = { title: '', message: '', type: 'info', target: 'all_tenants' };

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
  target: string;
  created_at: string;
};

const panelStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e9ecef',
  borderRadius: '1rem',
};

export default function NotificationsPage() {
  const { user, profile } = useAuth();
  const { t, language } = useTheme();
  const isAdmin = profile?.role === 'admin';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, { name: string; isRead: boolean }[]>>({});
  const [tenants, setTenants] = useState<{ id: string; full_name: string; user_id: string | null }[]>([]);
  const [caretakers, setCaretakers] = useState<{ id: string; full_name: string; user_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [sending, setSending] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      addToast(error.message, 'error');
      return;
    }
    setAnnouncements(data ?? []);
  }, [addToast]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications(data ?? []);
  }, [user]);

  const loadDeliveryStatuses = useCallback(async () => {
    if (!isAdmin || !user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('announcement_id, user_id, is_read')
      .eq('sender_id', user.id)
      .not('announcement_id', 'is', null);
    if (error) {
      addToast(error.message, 'error');
      return;
    }
    const rows = data ?? [];
    const userIds = [...new Set(rows.map(row => row.user_id))];
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [], error: null };
    if (profilesError) {
      addToast(profilesError.message, 'error');
      return;
    }
    const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name]));
    const statuses: Record<string, { name: string; isRead: boolean }[]> = {};
    for (const row of rows) {
      if (!row.announcement_id) continue;
      (statuses[row.announcement_id] ??= []).push({
        name: names.get(row.user_id) ?? (language === 'fr' ? 'Destinataire' : 'Recipient'),
        isRead: row.is_read,
      });
    }
    setDeliveryStatuses(statuses);
  }, [addToast, isAdmin, language, user]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAnnouncements(), loadNotifications(), loadDeliveryStatuses()])
      .finally(() => setLoading(false));
  }, [loadAnnouncements, loadNotifications, loadDeliveryStatuses]);

  // Realtime: update unread badge when new notification arrives
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notif-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, loadNotifications)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `sender_id=eq.${user.id}` }, loadDeliveryStatuses)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadNotifications, loadDeliveryStatuses]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      supabase.from('tenants').select('id, full_name, user_id').eq('status', 'active'),
      supabase.from('profiles').select('id, full_name').eq('role', 'caretaker').eq('is_active', true),
    ]).then(([tenantResult, caretakerResult]) => {
      if (tenantResult.error) addToast(tenantResult.error.message, 'error');
      else setTenants(tenantResult.data ?? []);
      if (caretakerResult.error) addToast(caretakerResult.error.message, 'error');
      else setCaretakers((caretakerResult.data ?? []).map(caretaker => ({
        id: caretaker.id,
        user_id: caretaker.id,
        full_name: caretaker.full_name,
      })));
    });
  }, [isAdmin, addToast]);

  const markRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) {
      addToast(error.message, 'error');
      return;
    }
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    if (error) {
      addToast(error.message, 'error');
      return;
    }
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })));
  };

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      addToast(language === 'fr' ? 'Le titre et le message sont requis.' : 'Title and message are required.', 'error');
      return;
    }
    setSending(true);
    const selectedUserId = form.target.startsWith('user:') ? form.target.slice(5) : null;
    const announcementTarget = selectedUserId ?? form.target;
    const { data: announcement, error } = await supabase.from('announcements').insert({
      title: form.title.trim(), message: form.message.trim(),
      type: form.type, target: announcementTarget, created_by: user?.id,
    }).select('id').single();
    if (error) {
      addToast(error.message, 'error');
    } else {
      let recipientIds: string[] = [];
      if (selectedUserId) {
        recipientIds = [selectedUserId];
      } else if (form.target === 'all_tenants') {
        recipientIds = tenants.flatMap(tenant => tenant.user_id ? [tenant.user_id] : []);
      } else if (form.target === 'all_caretakers') {
        recipientIds = caretakers.map(caretaker => caretaker.user_id);
      } else {
        recipientIds = [
          ...tenants.flatMap(tenant => tenant.user_id ? [tenant.user_id] : []),
          ...caretakers.map(caretaker => caretaker.user_id),
        ];
      }

      const recipients = [...new Set(recipientIds)].map(userId => ({
        user_id: userId,
        sender_id: user?.id,
        announcement_id: announcement.id,
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
      }));
      if (recipients.length > 0) {
        const { error: notificationError } = await supabase.from('notifications').insert(recipients);
        if (notificationError) {
          addToast(
            language === 'fr'
              ? `Annonce enregistrée, mais les notifications n'ont pas pu être envoyées : ${notificationError.message}`
              : `Announcement saved, but notifications could not be delivered: ${notificationError.message}`,
            'error',
          );
          loadAnnouncements();
          loadDeliveryStatuses();
          setSending(false);
          return;
        }
      }
      addToast(language === 'fr' ? 'Notification envoyée !' : 'Notification sent!', 'success');
      setForm({ ...emptyForm });
      setModalOpen(false);
      loadAnnouncements();
      loadDeliveryStatuses();
    }
    setSending(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.rpc('delete_announcement_with_notifications', {
      p_announcement_id: deleteId,
    });
    if (error) {
      addToast(
        error.code === 'PGRST202'
          ? (language === 'fr'
            ? 'La mise à jour Supabase pour la suppression des notifications n’est pas encore appliquée. Appliquez les migrations 20261013100000 et 20261013120000, puis réessayez.'
            : 'The Supabase notification-deletion update is not applied yet. Apply migrations 20261013100000 and 20261013120000, then try again.')
          : error.message,
        'error',
      );
      return;
    }
    setDeleteId(null);
    loadAnnouncements();
    loadDeliveryStatuses();
    addToast(language === 'fr' ? 'Supprimé' : 'Deleted', 'success');
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div className="notification-page space-y-6 max-w-3xl">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="notification-page-header flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('notificationsTitle')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAdmin
              ? (language === 'fr' ? 'Envoyer des messages aux locataires et concierges' : 'Send messages to tenants and caretakers')
              : unread > 0
              ? `${unread} ${t('unread')}`
              : t('allCaughtUp')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin && unread > 0 && (
            <Button variant="ghost" size="sm" icon={<CheckCheck className="w-4 h-4" />} onClick={markAllRead}>
              {t('markAllRead')}
            </Button>
          )}
          {isAdmin && (
            <Button className="notification-send-trigger page-action-button" icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>
              {t('sendNotification')}
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Admin: announcements sent */}
      {isAdmin && !loading && (
        <div className="space-y-3">
          {announcements.length === 0 && (
            <div className="notification-empty-state dark-theme-surface rounded-2xl p-12 text-center" style={panelStyle}>
              <Bell className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500">
                {language === 'fr' ? "Aucune notification envoyée pour l'instant" : 'No notifications sent yet'}
              </p>
            </div>
          )}
          {announcements.map(a => (
            <div
              key={a.id}
              className="notification-announcement-card dark-theme-surface rounded-xl p-4"
              style={{
                background: '#ffffff',
                border: '1px solid #e9ecef',
                borderLeft: `4px solid ${typeBorderColor[a.type] ?? typeBorderColor.info}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5 shrink-0">{typeIcons[a.type]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{a.title}</p>
                    <p className="text-slate-500 text-sm mt-1 leading-relaxed whitespace-pre-wrap">{a.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        {a.target === 'all_caretakers'
                          ? <><Users className="w-3 h-3" />{t('allCaretakers')}</>
                          : a.target === 'all_users'
                          ? <><Users className="w-3 h-3" />{t('allUsers')}</>
                          : a.target === 'all_tenants' || a.target === 'all'
                          ? <><Users className="w-3 h-3" />{t('allTenants')}</>
                          : <><User className="w-3 h-3" />{caretakers.some(c => c.id === a.target) ? t('specificCaretaker') : t('specificRecipient')}</>}
                      </span>
                      <span className="text-xs text-slate-600">
                        {new Date(a.created_at).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB')}
                      </span>
                    </div>
                    {deliveryStatuses[a.id] && (
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <p className="font-medium text-slate-700">
                          {language === 'fr' ? 'Ouvert / lu' : 'Opened / read'}: {deliveryStatuses[a.id].filter(recipient => recipient.isRead).length}/{deliveryStatuses[a.id].length}
                        </p>
                        <div className="mt-1 space-y-0.5">
                          {deliveryStatuses[a.id].map((recipient, index) => (
                            <p key={`${a.id}-${index}`}>
                              {recipient.name}: {recipient.isRead
                                ? (language === 'fr' ? 'Lu' : 'Read')
                                : (language === 'fr' ? 'Non lu' : 'Not read')}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDeleteId(a.id)}
                  className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tenant: personal notifications */}
      {!isAdmin && !loading && (
        <div className="space-y-2">
          {notifications.length === 0 && (
            <div className="notification-empty-state dark-theme-surface rounded-2xl p-12 text-center" style={panelStyle}>
              <Bell className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500">{t('noNotifications')}</p>
            </div>
          )}
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`notification-item dark-theme-surface rounded-xl p-4 transition-all cursor-pointer ${n.is_read ? '' : 'notification-item-unread'}`}
              style={{
                background: n.is_read ? '#f9fafb' : '#f0fdf4',
                border: '1px solid #e9ecef',
                borderLeft: `4px solid ${typeBorderColor[n.type] ?? typeBorderColor.info}`,
                opacity: n.is_read ? 0.6 : 1,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5 shrink-0">{typeIcons[n.type] ?? typeIcons.info}</div>
                  <div>
                    <p className={`font-semibold text-sm ${n.is_read ? 'text-slate-700' : 'text-slate-900'}`}>{n.title}</p>
                    <p className="text-sm mt-0.5 text-slate-500 leading-relaxed whitespace-pre-wrap">{n.message}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">{new Date(n.created_at).toLocaleDateString('en-GB')}</p>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full mt-1.5 ml-auto"
                      style={{ background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.6)' }} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compose modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('sendNotification')} size="lg" className="notification-compose-modal">
        <div className="space-y-4">
          <Select label={t('recipients')} value={form.target} onChange={set('target')}>
            <option value="all_tenants">{t('allTenants')}</option>
            <option value="all_caretakers">{t('allCaretakers')}</option>
            <option value="all_users">{t('allUsers')}</option>
            {tenants.map(tn => (
              tn.user_id ? <option key={tn.id} value={`user:${tn.user_id}`}>{tn.full_name} · {t('pendingRoleTenant')}</option> : null
            ))}
            {caretakers.map(caretaker => (
              <option key={caretaker.id} value={`user:${caretaker.user_id}`}>{caretaker.full_name} · {t('caretaker')}</option>
            ))}
          </Select>
          <Select label={t('notifType')} value={form.type} onChange={set('type')}>
            <option value="info">Info</option>
            <option value="warning">{language === 'fr' ? 'Avertissement' : 'Warning'}</option>
            <option value="success">{language === 'fr' ? 'Succès' : 'Success'}</option>
            <option value="error">{language === 'fr' ? 'Erreur' : 'Error'}</option>
          </Select>
          <Input label={t('notifTitle')} placeholder={language === 'fr' ? 'Titre de la notification' : 'Notification title'} value={form.title} onChange={set('title')} />
          <Textarea label={t('notifMessage')} placeholder={language === 'fr' ? "Rédigez votre message ici..." : 'Write your message here...'} value={form.message} onChange={set('message')} rows={6} />
        </div>
        <div className="notification-compose-actions flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
          <Button className="notification-submit" loading={sending} icon={<Send className="w-4 h-4" />} onClick={handleSend}>{t('send')}</Button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={language === 'fr' ? 'Supprimer la notification' : 'Delete Notification'} size="sm">
        <p className="text-slate-700 mb-6">
          {language === 'fr' ? 'Êtes-vous sûr de vouloir supprimer cette notification ?' : 'Are you sure you want to delete this notification?'}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{t('cancel')}</Button>
          <Button variant="danger" onClick={handleDelete}>{t('delete')}</Button>
        </div>
      </Modal>
    </div>
  );
}
