import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Mail, Home, Lock, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function CaretakerProfilePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { profile } = useAuth();
  const { t } = useTheme();
  const { toasts, addToast, removeToast } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const panelClass = 'bg-white border border-slate-200 rounded-2xl shadow-sm';

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    if (!profile?.profile_photo_path) return;

    supabase.storage
      .from('identity-documents')
      .createSignedUrl(profile.profile_photo_path, 300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          addToast(error.message, 'error');
          return;
        }
        setPhotoUrl(data.signedUrl);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          addToast(error instanceof Error ? error.message : 'Unable to load profile photo.', 'error');
        }
      });

    return () => { cancelled = true; };
  }, [profile?.profile_photo_path, addToast]);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      addToast(t('passwordMinLength'), 'error'); return;
    }
    if (newPassword !== confirmPassword) {
      addToast(t('passwordMismatch'), 'error'); return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) addToast(error.message, 'error');
    else { addToast(t('passwordChanged'), 'success'); setNewPassword(''); setConfirmPassword(''); }
    setSavingPassword(false);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div>
        <button
          onClick={() => onNavigate('caretaker-dashboard')}
          className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> {t('dashboard')}
        </button>
        <h1 className="text-2xl font-bold text-slate-900">{t('myCaretakerProfile')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('caretakerProfileSubtitle')}</p>
      </div>

      {/* Profile info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`${panelClass} p-5 sm:p-6`}
      >
        <div className="flex items-center gap-4 mb-6 pb-5 border-b border-slate-100">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={profile?.full_name ? `${profile.full_name} profile photo` : t('profilePhoto')}
              className="h-16 w-16 rounded-full border border-slate-200 object-cover shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center shadow-sm">
              <Shield className="w-8 h-8 text-slate-400" />
            </div>
          )}
          <div>
            <p className="text-lg font-bold text-slate-900">{profile?.full_name}</p>
            <p className="text-sm text-slate-500 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" />
              {profile?.assigned_property_name ?? t('noPropertyAssigned')}
            </p>
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
              {t('caretaker')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">{t('fullName')}</label>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-sm text-slate-700 font-medium">{profile?.full_name}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">{t('email')} ({t('cannotChange')})</label>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm text-slate-700">{profile?.email}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">{t('assignedProperty')} ({t('cannotChange')})</label>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <Home className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm text-slate-700">{profile?.assigned_property_name ?? t('notAssigned')}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">{t('phone')} ({t('cannotChange')})</label>
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700">
              {profile?.phone || '—'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Change password */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className={`${panelClass} p-5 sm:p-6`}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t('changePassword')}</h3>
            <p className="text-xs text-slate-500">{t('updateLoginPassword')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('newPassword')}
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder={t('passwordMinLength')}
          />
          <Input
            label={t('confirmPassword')}
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder={t('confirmPassword')}
          />
        </div>

        <div className="mt-5">
          <Button icon={<Lock className="w-4 h-4" />} onClick={handleChangePassword} disabled={savingPassword}>
            {savingPassword ? t('updating') : t('changePassword')}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
