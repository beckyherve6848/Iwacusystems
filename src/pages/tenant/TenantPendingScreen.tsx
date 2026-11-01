import React from 'react';
import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getThemeModeForCurrentDevice } from '@/lib/phoneThemeMode';

export default function TenantPendingScreen() {
  const { profile, signOut } = useAuth();
  const { language, appName, appLogoUrl } = useTheme();
  const isDark = getThemeModeForCurrentDevice() === 'dark';
  const isPropertyManager = profile?.role === 'property_manager';
  const content = language === 'fr'
    ? isPropertyManager ? {
        title: 'Compte en attente de validation',
        greeting: 'Bonjour',
        message: "Votre demande de compte gestionnaire immobilier a été reçue. Un administrateur doit approuver votre compte et vous attribuer des propriétés.",
        contact: "Vous pourrez accéder au tableau de bord une fois votre compte activé.",
        loggedIn: 'Vous êtes connecté en tant que',
        pending: 'Votre demande est en attente.',
        signOut: 'Déconnexion',
      } : {
        title: "En attente de la configuration du profil",
        greeting: 'Bonjour',
        message: 'Votre compte a été créé. Votre propriétaire doit compléter votre profil de locataire, notamment en vous attribuant un logement et en définissant les détails du loyer.',
        contact: "Veuillez contacter votre propriétaire ou le gestionnaire immobilier. Vous pourrez accéder aux fonctions locataire une fois la configuration terminée.",
        loggedIn: 'Vous êtes connecté en tant que',
        pending: 'Votre profil est en attente de validation.',
        signOut: 'Déconnexion',
      }
    : isPropertyManager ? {
        title: 'Awaiting Approval',
        greeting: 'Hi',
        message: 'Your Property Manager account request has been received. An administrator must approve your account and assign properties.',
        contact: 'Your dashboard will be available once your account is activated.',
        loggedIn: 'You are signed in as',
        pending: 'Your request is awaiting review.',
        signOut: 'Sign Out',
      } : {
        title: 'Awaiting Profile Setup',
        greeting: 'Hi',
        message: 'Your account has been created. Your landlord needs to complete your tenant profile, including assigning a house and setting your rent details.',
        contact: 'Please contact your landlord or property manager. You can access tenant features once setup is complete.',
        loggedIn: 'You are signed in as',
        pending: 'Your profile is awaiting approval.',
        signOut: 'Sign Out',
      };

  return (
    <main className={`tenant-pending-screen${isDark ? ' phone-dark' : ''}`}>
      <div className="tenant-pending-shell">
        <div className="tenant-pending-brand">
          <img src={appLogoUrl} alt={`${appName} logo`} />
        </div>

        <div className="tenant-pending-heading">
          <span className="tenant-pending-clock" aria-hidden="true">
            <Clock />
          </span>
          <h1>{content.title}</h1>
        </div>

        <section className="tenant-pending-card" aria-label={content.title}>
          <p className="tenant-pending-greeting">
            {content.greeting} <span>{profile?.full_name}</span>,
          </p>
          <p className="tenant-pending-message">{content.message}</p>
          <p className="tenant-pending-contact">{content.contact}</p>
        </section>

        <div className="tenant-pending-notice" role="status">
          <p>
            {content.loggedIn} <span>{profile?.email}</span>. {content.pending}
          </p>
        </div>

        <button onClick={signOut} className="tenant-pending-signout">
          <LogOut aria-hidden="true" />
          {content.signOut}
        </button>
      </div>
    </main>
  );
}
