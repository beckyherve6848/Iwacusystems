import React from 'react';
import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function TenantPendingScreen() {
  const { profile, signOut } = useAuth();
  const { language, appName, appLogoUrl } = useTheme();
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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f7f8fa' }}>
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white shadow-md">
            <img src={appLogoUrl} alt={`${appName} logo`} className="h-12 w-12 object-contain" />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-amber-400" />
          <h1 className="text-xl font-bold text-slate-900">{content.title}</h1>
        </div>

        <div className="rounded-2xl p-6 mb-6" style={{ background: '#ffffff', border: '1px solid #e9ecef' }}>
          <p className="text-slate-700 text-sm leading-relaxed mb-4">
            {content.greeting} <span className="font-semibold text-slate-900">{profile?.full_name}</span>,
          </p>
          <p className="text-slate-500 text-sm leading-relaxed">{content.message}</p>
          <p className="text-slate-500 text-sm leading-relaxed mt-3">{content.contact}</p>
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(17,24,39,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p className="text-amber-700 text-xs">
            {content.loggedIn} <span className="font-semibold">{profile?.email}</span>. {content.pending}
          </p>
        </div>

        <button
          onClick={signOut}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:text-slate-900 transition-all"
          style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}
        >
          <LogOut className="w-4 h-4" />
          {content.signOut}
        </button>
      </div>
    </div>
  );
}
