import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const NOTICE_VERSION = 'activity-tracking-notice-v2';

export default function ActivityTrackingNotice() {
  const { profile } = useAuth();
  const { language } = useTheme();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!profile || !['property_manager', 'caretaker'].includes(profile.role)) {
      setDismissed(true);
      return;
    }
    setDismissed(window.localStorage.getItem(`${NOTICE_VERSION}:${profile.id}`) === 'dismissed');
  }, [profile]);

  if (dismissed || !profile || !['property_manager', 'caretaker'].includes(profile.role)) return null;

  const acknowledge = () => {
    window.localStorage.setItem(`${NOTICE_VERSION}:${profile.id}`, 'dismissed');
    setDismissed(true);
  };

  return (
    <aside
      className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950"
      aria-label={language === 'fr' ? 'Avis de suivi des activités' : 'Activity tracking notice'}
    >
      <Eye className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
      <p className="flex-1 text-sm leading-5">
        {language === 'fr'
          ? 'Pour la sécurité et la qualité du service, les administrateurs peuvent consulter les pages visitées, les actions effectuées et les messages de l’assistance. Les mots de passe et les brouillons non envoyés ne sont pas enregistrés.'
          : 'For security and service quality, administrators can review pages visited, actions taken, and support-chat messages. Passwords and unsent drafts are not logged.'}
      </p>
      <button
        type="button"
        onClick={acknowledge}
        className="rounded-lg p-1 text-sky-700 hover:bg-sky-100"
        aria-label={language === 'fr' ? 'Fermer l’avis' : 'Dismiss notice'}
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
