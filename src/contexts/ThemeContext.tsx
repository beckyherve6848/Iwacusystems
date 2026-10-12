import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Language = 'en' | 'fr';
export type Currency = 'KSh' | 'BIF' | 'USD' | 'EUR' | 'Frw' | 'Ugx' | 'Tsh' | 'Cdf';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  KSh: 'KSh',
  BIF: 'Fbu',
  USD: '$',
  EUR: '€',
  Frw: 'Frw',
  Ugx: 'Ugx',
  Tsh: 'Tsh',
  Cdf: 'Cdf',
};

interface ThemeContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  currencyRatesAvailable: boolean;
  currencyRatesLoading: boolean;
  currencyRatesError: boolean;
  refreshCurrencyRates: () => void;
  fmt: (n: number) => string;
  appName: string;
  appLogoUrl: string;
  propertyPhone: string;
  propertyAddress: string;
  staffCardFooter: string;
  staffCardFooterFr: string;
  loginBackgroundUrl: string;
  loginFamilyImageUrl: string;
  updateBranding: (branding: Partial<Pick<ThemeContextValue, 'appName' | 'appLogoUrl' | 'propertyPhone' | 'propertyAddress' | 'staffCardFooter' | 'staffCardFooterFr' | 'loginBackgroundUrl' | 'loginFamilyImageUrl'>>) => void;
}

export const DEFAULT_STAFF_CARD_FOOTER = 'If found, return this ID card to the Property Management Office at {address}.\nIf lost, contact Property Management immediately using the official contact details: {phone}.';
export const DEFAULT_STAFF_CARD_FOOTER_FR = 'Si cette carte est trouvée, veuillez la remettre au bureau de gestion immobilière à {address}.\nEn cas de perte, veuillez contacter immédiatement la gestion immobilière au numéro officiel : {phone}.';

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Nav
    dashboard: 'Dashboard', houses: 'Houses', tenants: 'Tenants', caretakers: 'Caretakers', invoices: 'Invoices',
    payments: 'Payments', agreements: 'Agreements', maintenance: 'Maintenance',
    visitors: 'Visitors', reports: 'Reports', notifications: 'Notifications',
    settings: 'Settings', signOut: 'Sign Out', search: 'Search...', userActivity: 'User Activity',
    searchPlaceholder: 'Search pages, names, IDs, invoices, receipts, codes...',
    searchLoading: 'Searching...',
    searchNoResults: 'No matching pages or records.',
    searchPartialError: 'Some results could not be loaded. Showing available results.',
    searchError: 'Search could not load results. Please try again.',
    searchClear: 'Clear search',
    searchOpenPage: 'Open page',
    searchPageCategory: 'Page',
    searchInvoiceCategory: 'Invoice',
    searchReceiptCategory: 'Receipt',
    userActivityDescription: 'Review page visits, structured record changes, and support-message activity. Only changed field names and selected status values are logged; ordinary text field values are not.',
    userActivityPageViews: 'Page visits',
    userActivityChanges: 'Record changes',
    userActivityMessages: 'Chat interactions',
    userActivityRole: 'Role',
    userActivityAllRoles: 'All tracked roles',
    userActivityType: 'Activity type',
    userActivityAllTypes: 'All activity',
    userActivitySearchPerson: 'Find a person',
    userActivitySearchPlaceholder: 'Search name or email',
    userActivitySearching: 'Searching...',
    userActivityTracking: 'Showing activity for',
    userActivityTimeline: 'Activity timeline',
    userActivityEvents: 'events',
    userActivityLoading: 'Loading activity...',
    userActivityEmpty: 'No activity was found for these filters.',
    userActivityUnknownUser: 'Unknown user',
    userActivityPageView: 'Opened page',
    userActivityMessageSent: 'Sent support message',
    userActivityMessageRead: 'Read support message',
    userActivityChangedData: 'Changed a record',
    userActivityMessageDeleted: 'Original message was deleted',
    userActivityPagesSummary: 'Pages visited',
    userActivityLoadError: 'Unable to load activity',
    userActivityDeleteError: 'Unable to delete activity',
    userActivityDeleted: 'Activity records permanently deleted',
    userActivityDeleteAll: 'Delete history',
    previous: 'Previous',
    next: 'Next',
    'gk-dashboard': 'Dashboard', 'tenant-dashboard': 'Dashboard', 'manager-dashboard': 'Dashboard',
    'tenant-payments': 'My Payments', 'tenant-invoices': 'My Invoices', 'tenant-maintenance': 'Maintenance',
    'tenant-agreement': 'My Agreement',
    // Auth
    welcomeBack: 'Welcome back', signInSubtitle: 'Sign in to access your dashboard',
    createAccount: 'Create account', registerSubtitle: 'Register as a tenant to get started',
    signIn: 'Sign In', register: 'Register', fullName: 'Full Name', email: 'Email Address',
    phone: 'Phone Number', password: 'Password', confirmPassword: 'Confirm Password',
    adminNote: 'Admin and Gatekeeper accounts are created by the system administrator.',
    registerNote: 'After registration, the administrator will complete your tenant profile.',
    // Dashboard
    welcomeBackMsg: "Welcome back — here's what's happening today.",
    totalHouses: 'Total Houses', occupied: 'Occupied', vacant: 'Vacant',
    maintenanceHouses: 'Under Maintenance', activeTenants: 'Active Tenants',
    familyMembers: 'family members', expectedRent: 'Expected Rent',
    collected: 'Collected', outstanding: 'Outstanding', visitorsToday: 'Visitors Today',
    monthlyIncome: 'Monthly Income', last6months: 'Last 6 months rent collected',
    paymentStatus: 'Payment Status', currentBreakdown: 'Current period breakdown',
    noPaymentsYet: 'No payments yet', recentPayments: 'Recent Payments',
    recentVisitors: 'Recent Visitors', maintenanceRequests: 'Maintenance Requests',
    viewAll: 'View all', noVisitorsYet: 'No visitors yet', noRequestsYet: 'No requests yet',
    // Tenant dashboard
    myDashboard: 'My Dashboard', myProfile: 'My Profile', myHouse: 'My House',
    paymentInstructions: 'Payment Instructions', profileNotSetup: 'Profile not set up yet. Contact your landlord.',
    noHouseAssigned: 'No house assigned yet.', noPaymentRecords: 'No payment records yet',
    maintenanceRequest: 'Maintenance Request', submitMaintenance: 'Submit Maintenance Request',
    titleRequired: 'Title *', descRequired: 'Description *',
    priority: 'Priority', low: 'Low', medium: 'Medium', high: 'High',
    titleDescRequired: 'Title and description are required',
    maintenanceSubmitted: 'Maintenance request submitted',
    leakingTapPlaceholder: 'e.g. Leaking tap in bathroom',
    descPlaceholder: 'Describe the issue in detail...',
    // Pages
    manageHouses: 'Manage all rental units', addHouse: 'Add House', addTenant: 'Add Tenant',
    manageTenants: 'Manage all tenant profiles', allStatuses: 'All Statuses',
    active: 'Active', vacated: 'Vacated', blacklisted: 'Blacklisted',
    roleFor: 'Role for',
    editTenantProfile: 'Edit Tenant',
    completeTenantProfile: 'Complete Tenant Profile',
    addTenantProfile: 'Add Tenant',
    paid: 'Paid', partial: 'Partial', overdue: 'Overdue', pending: 'Pending',
    specificRecipient: 'Specific recipient',
    // Notifications
    notificationsTitle: 'Notifications', allCaughtUp: 'All caught up',
    unread: 'unread', markAllRead: 'Mark all read', noNotifications: 'No notifications yet',
    // Compose (admin)
    sendNotification: 'Send Notification', recipients: 'Recipients',
    allTenants: 'All Tenants', selectTenant: 'Select a specific tenant',
    notifType: 'Type', notifTitle: 'Title', notifMessage: 'Message',
    send: 'Send', cancel: 'Cancel',
    // Tenant removal
    removeAccount: 'Remove Account', removeAccountConfirm: "This will permanently delete the tenant's login account. They can register again fresh.",
    delete: 'Delete',
    // Role labels
    administrator: 'Administrator', gatekeeper: 'Gatekeeper', tenant: 'Tenant', caretaker: 'Caretaker',
    propertyManager: 'Property Manager', propertyManagers: 'Property Managers',
    // Fields
    houseNumber: 'House', category: 'Category', monthlyRent: 'Monthly Rent',
    moveIn: 'Move In', id: 'ID', name: 'Name', status: 'Status',
    // Chat
    chat: 'Chat', 'tenant-chat': 'Chat with Admin', 'admin-chat': 'Call Center',
    chatCenter: 'Chat Center', chatWithAdmin: 'Chat with Administration',
    callCenter: 'Call Center', conversations: 'Conversations', allConversations: 'All',
    selectConversation: 'Select a conversation', noConversations: 'No conversations yet',
    typeMessage: 'Type a message...', online: 'Online', offline: 'Offline',
    lastSeen: 'Last seen', justNow: 'just now', minutesAgo: 'min ago', hoursAgo: 'h ago',
    adminSupport: 'Admin Support', you: 'You', today: 'Today',
    messageEmpty: 'Start the conversation — send your first message.',
    messageSendFailed: 'Unable to send the message. Please try again.',
    chatReplyMigrationRequired: 'Chat replies need the latest chat database migration. Apply it, then try again.',
    reply: 'Reply',
    replyingTo: 'Replying to',
    cancelReply: 'Cancel reply',
    originalMessageUnavailable: 'Original message is no longer available',
    deleteConversation: 'Delete conversation',
    deleteConversationConfirm: 'Delete this conversation and all of its messages? This will also remove it from the tenant’s chat.',
    conversationDeleted: 'Conversation deleted',
    conversationCleared: 'There is no active support conversation. Start a new one to message Administration.',
    startConversation: 'Start a new conversation',
    deleting: 'Deleting...',
    'caretaker-dashboard': 'Dashboard', 'caretaker-visitors': 'Visitors',
    'caretaker-register-visitor': 'Register Visitor', 'caretaker-profile': 'Profile',
    rentalManagement: 'Rental Management',
    propertyPlatform: 'Property Management Platform',
    pendingRegistrations: 'Pending Registrations',
    pendingRegistrationsMessage: 'New tenant, caretaker, or property manager accounts need your review.',
    reviewRegistrations: 'Review registrations',
    chooseAccountRole: 'Choose a role for each new account',
    setUpTenant: 'Set Up Tenant',
    completeAsCaretaker: 'Complete as Caretaker',
    setUpPropertyManager: 'Set Up Property Manager',
    registrationDenied: 'Deny registration',
    denyRegistration: 'Deny Registration',
    denyRegistrationConfirm: 'Deny this registration? The account will be deactivated and will no longer be able to sign in.',
    registrationDeniedSuccess: 'Registration denied and account deactivated.',
    unableToDenyRegistration: 'Unable to deny registration',
    pendingRoleTenant: 'Tenant',
    allCaretakers: 'All caretakers',
    allUsers: 'All tenants and caretakers',
    specificCaretaker: 'Specific caretaker',
    specificTenant: 'Specific tenant',
    registrationNeedsReview: 'Registration needs review',
    rentalAgreementTitle: 'Rental Management System',
    welcome: 'Welcome',
    noPropertyAssigned: 'No property assigned',
    quickActions: 'Quick Actions',
    registerVisitor: 'Register Visitor',
    viewVisitors: 'View Visitors',
    checkIn: 'Check In',
    checkOut: 'Check Out',
    viewProfile: 'View Profile',
    todayVisitors: "Today's Visitors",
    currentlyInside: 'Currently Inside',
    thisMonth: 'This Month',
    recentVisitorRegistrations: 'Recent Visitor Registrations',
    noVisitorsRegistered: 'No visitors registered yet.',
    inside: 'Inside',
    left: 'Left',
    myCaretakerProfile: 'My Profile',
    caretakerProfileSubtitle: 'View and update your caretaker profile',
    assignedProperty: 'Assigned Property',
    cannotChange: 'cannot change',
    notAssigned: 'Not assigned',
    changePassword: 'Change Password',
    updateLoginPassword: 'Update your login password',
    newPassword: 'New Password',
    saveChanges: 'Save Changes',
    saving: 'Saving...',
    updating: 'Updating...',
    profileUpdated: 'Profile updated',
    passwordMinLength: 'Password must be at least 6 characters',
    passwordMismatch: 'Passwords do not match',
    passwordChanged: 'Password changed successfully',
    manageVisitorActivity: 'Manage and track all visitor activity',
    thisWeek: 'This Week',
    checkedIn: 'Checked In',
    checkedOut: 'Checked Out',
    searchVisitorPlaceholder: 'Search name, tenant, apartment...',
    visitor: 'Visitor',
    apartment: 'Apartment',
    checkInAt: 'Check-In',
    checkOutAt: 'Check-Out',
    actions: 'Actions',
    noVisitorsFound: 'No visitors found',
    viewDetails: 'View details',
    visitorDetails: 'Visitor Details',
    noPhone: 'No phone',
    nationalId: 'National ID',
    visitorsCount: 'Visitors Count',
    expectedDeparture: 'Expected Departure',
    visitDate: 'Visit Date',
    visitorRegistered: 'Visitor registered successfully',
    visitorNameRequired: 'Visitor name and purpose are required',
    recordVisitorEntry: 'Record a new visitor entry',
    visitorName: 'Visitor Name',
    numberOfVisitors: 'Number of Visitors',
    personVisiting: 'Person Visiting (Tenant)',
    selectTenantForVisit: 'Select tenant',
    selectHouse: 'Select house',
    visitPurpose: 'Visit Purpose',
    visitTime: 'Visit Time',
    additionalVisitorNotes: 'Additional notes about this visitor...',
    purpose: 'Purpose',
    notes: 'Notes',
    optional: 'Optional',
    registerVisitorDescription: 'Record a new visitor entry',
    // Common
    noDataYet: 'No data yet',
    currency: 'Currency',
    currencyRatesLoading: 'Loading exchange rates…',
    currencyRatesUnavailable: 'Live exchange rates are unavailable. Amounts are shown in Fbu.',
    retryCurrencyRates: 'Retry',
    house: 'House',
    invoice: 'Invoice',
    invoiceNumber: 'Invoice Number',
    invoiceDetails: 'Invoice details',
    issuedOn: 'Issued on',
    description: 'Description',
    printSavePdf: 'Print / Save PDF',
    invoiceMonth: 'Billing Month',
    invoiceDueDate: 'Due Date',
    rent: 'Rent',
    water: 'Water',
    electricity: 'Electricity',
    totalDue: 'Total Due',
    unpaid: 'Unpaid',
    createInvoice: 'Create Invoice',
    editInvoice: 'Edit Invoice',
    noInvoices: 'No invoices yet',
    invoiceSaved: 'Invoice saved',
    invoiceDeleted: 'Invoice deleted',
    markPaid: 'Mark as Paid',
    markUnpaid: 'Mark as Unpaid',
    printInvoice: 'Print Invoice',
    saveInvoice: 'Save Invoice',
    caretakerManagement: 'Manage caretaker accounts and property assignments',
    noCaretakers: 'No caretaker accounts found',
    accountStatus: 'Account Status',
    inactive: 'Inactive',
    save: 'Save',
    invoiceRentUtilities: 'Rent + Water + Electricity',
    loading: 'Loading...',
    deactivate: 'Deactivate',
    activate: 'Activate',
    editCaretaker: 'Edit caretaker',
    caretakerDetails: 'Caretaker details',
    createdAt: 'Created',
  },
  fr: {
    // Nav
    dashboard: 'Tableau de bord', houses: 'Maisons', tenants: 'Locataires', caretakers: 'Concierges', invoices: 'Factures',
    payments: 'Paiements', agreements: 'Contrats', maintenance: 'Maintenance',
    visitors: 'Visiteurs', reports: 'Rapports', notifications: 'Notifications',
    settings: 'Paramètres', signOut: 'Déconnexion', search: 'Rechercher...', userActivity: 'Activité des utilisateurs',
    searchPlaceholder: 'Rechercher des pages, noms, identifiants, factures, reçus, codes...',
    searchLoading: 'Recherche en cours...',
    searchNoResults: 'Aucune page ou donnée correspondante.',
    searchPartialError: 'Certains résultats sont indisponibles. Voici les résultats accessibles.',
    searchError: 'La recherche n’a pas pu charger les résultats. Veuillez réessayer.',
    searchClear: 'Effacer la recherche',
    searchOpenPage: 'Ouvrir la page',
    searchPageCategory: 'Page',
    searchInvoiceCategory: 'Facture',
    searchReceiptCategory: 'Reçu',
    userActivityDescription: 'Consultez les pages ouvertes, les modifications structurées et l’activité des messages d’assistance. Seuls les noms des champs modifiés et certains statuts sont enregistrés, jamais le contenu des champs texte ordinaires.',
    userActivityPageViews: 'Pages consultées',
    userActivityChanges: 'Modifications',
    userActivityMessages: 'Interactions de discussion',
    userActivityRole: 'Rôle',
    userActivityAllRoles: 'Tous les rôles suivis',
    userActivityType: 'Type d’activité',
    userActivityAllTypes: 'Toutes les activités',
    userActivitySearchPerson: 'Rechercher une personne',
    userActivitySearchPlaceholder: 'Rechercher par nom ou e-mail',
    userActivitySearching: 'Recherche en cours...',
    userActivityTracking: 'Activité de',
    userActivityTimeline: 'Historique des activités',
    userActivityEvents: 'événements',
    userActivityLoading: 'Chargement des activités...',
    userActivityEmpty: 'Aucune activité ne correspond à ces filtres.',
    userActivityUnknownUser: 'Utilisateur inconnu',
    userActivityPageView: 'Page ouverte',
    userActivityMessageSent: 'Message d’assistance envoyé',
    userActivityMessageRead: 'Message d’assistance lu',
    userActivityChangedData: 'Enregistrement modifié',
    userActivityMessageDeleted: 'Le message original a été supprimé',
    userActivityPagesSummary: 'Pages consultées',
    userActivityLoadError: 'Impossible de charger l’activité',
    userActivityDeleteError: 'Impossible de supprimer l’activité',
    userActivityDeleted: 'Journaux d’activité définitivement supprimés',
    userActivityDeleteAll: 'Supprimer l’historique',
    previous: 'Précédent',
    next: 'Suivant',
    'gk-dashboard': 'Tableau de bord', 'tenant-dashboard': 'Tableau de bord', 'manager-dashboard': 'Tableau de bord',
    'tenant-payments': 'Mes paiements', 'tenant-invoices': 'Mes factures', 'tenant-maintenance': 'Maintenance',
    'tenant-agreement': 'Mon Contrat',
    // Auth
    welcomeBack: 'Bon retour', signInSubtitle: 'Connectez-vous à votre tableau de bord',
    createAccount: 'Créer un compte', registerSubtitle: 'Inscrivez-vous en tant que locataire',
    signIn: 'Se connecter', register: "S'inscrire", fullName: 'Nom complet',
    email: 'Adresse e-mail', phone: 'Numéro de téléphone', password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    adminNote: "Les comptes Admin et Gardien sont créés par l'administrateur système.",
    registerNote: "Après inscription, l'administrateur complétera votre profil de locataire.",
    // Dashboard
    welcomeBackMsg: "Bon retour — voici ce qui se passe aujourd'hui.",
    totalHouses: 'Total Maisons', occupied: 'Occupées', vacant: 'Libres',
    maintenanceHouses: 'En Maintenance', activeTenants: 'Locataires Actifs',
    familyMembers: 'membres de la famille', expectedRent: 'Loyer Attendu',
    collected: 'Collecté', outstanding: 'En Attente', visitorsToday: "Visiteurs Aujourd'hui",
    monthlyIncome: 'Revenu Mensuel', last6months: 'Loyers collectés ces 6 derniers mois',
    paymentStatus: 'Statut des Paiements', currentBreakdown: 'Répartition de la période actuelle',
    noPaymentsYet: 'Aucun paiement encore', recentPayments: 'Paiements Récents',
    recentVisitors: 'Visiteurs Récents', maintenanceRequests: 'Demandes de Maintenance',
    viewAll: 'Voir tout', noVisitorsYet: 'Aucun visiteur encore', noRequestsYet: 'Aucune demande encore',
    // Tenant dashboard
    myDashboard: 'Mon Tableau de Bord', myProfile: 'Mon Profil', myHouse: 'Ma Maison',
    paymentInstructions: 'Instructions de Paiement', profileNotSetup: 'Profil non configuré. Contactez votre propriétaire.',
    noHouseAssigned: 'Aucune maison assignée.', noPaymentRecords: 'Aucun enregistrement de paiement',
    maintenanceRequest: 'Demande de Maintenance', submitMaintenance: 'Soumettre une Demande',
    titleRequired: 'Titre *', descRequired: 'Description *',
    priority: 'Priorité', low: 'Faible', medium: 'Moyen', high: 'Élevé',
    titleDescRequired: 'Le titre et la description sont requis',
    maintenanceSubmitted: 'Demande de maintenance soumise',
    leakingTapPlaceholder: 'ex. Robinet qui fuit dans la salle de bain',
    descPlaceholder: "Décrivez le problème en détail...",
    // Pages
    manageHouses: 'Gérer toutes les unités locatives', addHouse: 'Ajouter une maison',
    addTenant: 'Ajouter un locataire', manageTenants: 'Gérer tous les profils de locataires',
    allStatuses: 'Tous les statuts', active: 'Actif', vacated: 'Libéré', blacklisted: 'Blacklisté',
    roleFor: 'Rôle de',
    editTenantProfile: 'Modifier le locataire',
    completeTenantProfile: 'Compléter le profil du locataire',
    addTenantProfile: 'Ajouter un locataire',
    paid: 'Payé', partial: 'Partiel', overdue: 'En retard', pending: 'En attente',
    specificRecipient: 'Destinataire spécifique',
    // Notifications
    notificationsTitle: 'Notifications', allCaughtUp: 'Tout est à jour',
    unread: 'non lus', markAllRead: 'Tout marquer comme lu', noNotifications: 'Pas encore de notifications',
    // Compose (admin)
    sendNotification: 'Envoyer une notification', recipients: 'Destinataires',
    allTenants: 'Tous les locataires', selectTenant: 'Sélectionner un locataire',
    notifType: 'Type', notifTitle: 'Titre', notifMessage: 'Message',
    send: 'Envoyer', cancel: 'Annuler',
    // Tenant removal
    removeAccount: 'Supprimer le compte', removeAccountConfirm: 'Cela supprimera définitivement le compte de connexion du locataire.',
    delete: 'Supprimer',
    // Role labels
    administrator: 'Administrateur', gatekeeper: 'Gardien', tenant: 'Locataire', caretaker: 'Concierge',
    propertyManager: 'Gestionnaire immobilier', propertyManagers: 'Gestionnaires immobiliers',
    // Fields
    houseNumber: 'Maison', category: 'Catégorie', monthlyRent: 'Loyer Mensuel',
    moveIn: 'Emménagement', id: 'ID', name: 'Nom', status: 'Statut',
    // Chat
    chat: 'Discussion', 'tenant-chat': 'Discuter avec l\'Admin', 'admin-chat': 'Centre d\'Appels',
    chatCenter: 'Centre de Discussion', chatWithAdmin: 'Discuter avec l\'Administration',
    callCenter: 'Centre d\'Appels', conversations: 'Conversations', allConversations: 'Toutes',
    selectConversation: 'Sélectionner une conversation', noConversations: 'Aucune conversation',
    typeMessage: 'Tapez un message...', online: 'En ligne', offline: 'Hors ligne',
    lastSeen: 'Dernière connexion', justNow: 'à l\'instant', minutesAgo: 'min', hoursAgo: 'h',
    adminSupport: 'Support Admin', you: 'Vous', today: 'Aujourd\'hui',
    messageEmpty: 'Commencez la conversation — envoyez votre premier message.',
    messageSendFailed: 'Impossible d’envoyer le message. Veuillez réessayer.',
    chatReplyMigrationRequired: 'Les réponses nécessitent la dernière migration de la base de données du chat. Appliquez-la puis réessayez.',
    reply: 'Répondre',
    replyingTo: 'Réponse à',
    cancelReply: 'Annuler la réponse',
    originalMessageUnavailable: 'Le message d’origine n’est plus disponible',
    deleteConversation: 'Supprimer la conversation',
    deleteConversationConfirm: 'Supprimer cette conversation et tous ses messages ? Elle sera également supprimée du chat du locataire.',
    conversationDeleted: 'Conversation supprimée',
    conversationCleared: 'Aucune conversation de support active. Démarrez-en une nouvelle pour écrire à l’administration.',
    startConversation: 'Démarrer une nouvelle conversation',
    deleting: 'Suppression...',
    'caretaker-dashboard': 'Tableau de bord', 'caretaker-visitors': 'Visiteurs',
    'caretaker-register-visitor': 'Enregistrer Visiteur', 'caretaker-profile': 'Profil',
    rentalManagement: 'Gestion locative',
    propertyPlatform: 'Plateforme de gestion immobilière',
    pendingRegistrations: 'Inscriptions en attente',
    pendingRegistrationsMessage: 'Les nouveaux comptes locataire, concierge ou gestionnaire immobilier doivent être examinés.',
    reviewRegistrations: 'Examiner les inscriptions',
    chooseAccountRole: 'Choisissez un rôle pour chaque nouveau compte',
    setUpTenant: 'Configurer le locataire',
    completeAsCaretaker: 'Valider comme concierge',
    setUpPropertyManager: 'Configurer le gestionnaire immobilier',
    registrationDenied: "Refuser l'inscription",
    denyRegistration: "Refuser l'inscription",
    denyRegistrationConfirm: "Refuser cette inscription ? Le compte sera désactivé et ne pourra plus se connecter.",
    registrationDeniedSuccess: 'Inscription refusée et compte désactivé.',
    unableToDenyRegistration: "Impossible de refuser l'inscription",
    pendingRoleTenant: 'Locataire',
    allCaretakers: 'Tous les concierges',
    allUsers: 'Tous les locataires et concierges',
    specificCaretaker: 'Concierge spécifique',
    specificTenant: 'Locataire spécifique',
    registrationNeedsReview: 'Inscription à examiner',
    rentalAgreementTitle: 'Système de gestion locative',
    welcome: 'Bienvenue',
    noPropertyAssigned: 'Aucune propriété assignée',
    quickActions: 'Actions rapides',
    registerVisitor: 'Enregistrer un visiteur',
    viewVisitors: 'Voir les visiteurs',
    checkIn: 'Enregistrer l’arrivée',
    checkOut: 'Enregistrer le départ',
    viewProfile: 'Voir le profil',
    todayVisitors: "Visiteurs d'aujourd'hui",
    currentlyInside: 'Actuellement présents',
    thisMonth: 'Ce mois-ci',
    recentVisitorRegistrations: 'Inscriptions récentes des visiteurs',
    noVisitorsRegistered: 'Aucun visiteur enregistré pour le moment.',
    inside: 'Présent',
    left: 'Parti',
    myCaretakerProfile: 'Mon profil',
    caretakerProfileSubtitle: 'Consultez et modifiez votre profil de concierge',
    assignedProperty: 'Propriété assignée',
    cannotChange: 'non modifiable',
    notAssigned: 'Non assignée',
    changePassword: 'Modifier le mot de passe',
    updateLoginPassword: 'Mettez à jour votre mot de passe',
    newPassword: 'Nouveau mot de passe',
    saveChanges: 'Enregistrer les modifications',
    saving: 'Enregistrement...',
    updating: 'Mise à jour...',
    profileUpdated: 'Profil mis à jour',
    passwordMinLength: 'Le mot de passe doit comporter au moins 6 caractères',
    passwordMismatch: 'Les mots de passe ne correspondent pas',
    passwordChanged: 'Mot de passe modifié avec succès',
    manageVisitorActivity: 'Gérer et suivre toutes les visites',
    thisWeek: 'Cette semaine',
    checkedIn: 'Arrivées',
    checkedOut: 'Départs',
    searchVisitorPlaceholder: 'Rechercher un nom, locataire, appartement...',
    visitor: 'Visiteur',
    apartment: 'Appartement',
    checkInAt: 'Arrivée',
    checkOutAt: 'Départ',
    actions: 'Actions',
    noVisitorsFound: 'Aucun visiteur trouvé',
    viewDetails: 'Voir les détails',
    visitorDetails: 'Détails du visiteur',
    noPhone: 'Aucun téléphone',
    nationalId: 'Pièce d’identité',
    visitorsCount: 'Nombre de visiteurs',
    expectedDeparture: 'Départ prévu',
    visitDate: 'Date de visite',
    visitorRegistered: 'Visiteur enregistré avec succès',
    visitorNameRequired: 'Le nom du visiteur et le motif sont obligatoires',
    recordVisitorEntry: 'Enregistrer une nouvelle visite',
    visitorName: 'Nom du visiteur',
    numberOfVisitors: 'Nombre de visiteurs',
    personVisiting: 'Personne visitée (locataire)',
    selectTenantForVisit: 'Sélectionner un locataire',
    selectHouse: 'Sélectionner un logement',
    visitPurpose: 'Motif de la visite',
    visitTime: 'Heure de visite',
    additionalVisitorNotes: 'Notes supplémentaires sur ce visiteur...',
    purpose: 'Motif',
    notes: 'Notes',
    optional: 'Facultatif',
    registerVisitorDescription: 'Enregistrer une nouvelle visite',
    // Common
    noDataYet: 'Pas encore de données',
    currency: 'Devise',
    currencyRatesLoading: 'Chargement des taux de change…',
    currencyRatesUnavailable: 'Les taux de change en direct sont indisponibles. Les montants sont affichés en Fbu.',
    retryCurrencyRates: 'Réessayer',
    house: 'Logement',
    invoice: 'Facture',
    invoiceNumber: 'Numéro de facture',
    invoiceDetails: 'Détails de la facture',
    issuedOn: 'Émise le',
    description: 'Description',
    printSavePdf: 'Imprimer / Enregistrer en PDF',
    invoiceMonth: 'Mois facturé',
    invoiceDueDate: 'Date d’échéance',
    rent: 'Loyer',
    water: 'Eau',
    electricity: 'Électricité',
    totalDue: 'Total à payer',
    unpaid: 'Impayée',
    createInvoice: 'Créer une facture',
    editInvoice: 'Modifier la facture',
    noInvoices: 'Aucune facture pour le moment',
    invoiceSaved: 'Facture enregistrée',
    invoiceDeleted: 'Facture supprimée',
    markPaid: 'Marquer comme payée',
    markUnpaid: 'Marquer comme impayée',
    printInvoice: 'Imprimer la facture',
    saveInvoice: 'Enregistrer la facture',
    caretakerManagement: 'Gérer les comptes des concierges et leurs propriétés',
    noCaretakers: 'Aucun compte concierge trouvé',
    accountStatus: 'État du compte',
    inactive: 'Inactif',
    save: 'Enregistrer',
    invoiceRentUtilities: 'Loyer + Eau + Électricité',
    loading: 'Chargement...',
    deactivate: 'Désactiver',
    activate: 'Activer',
    editCaretaker: 'Modifier le concierge',
    caretakerDetails: 'Détails du concierge',
    createdAt: 'Créé le',
  },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ExchangeRateResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
}

type LiveCurrencyRates = Record<Exclude<Currency, 'BIF'>, number>;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<Language>(() =>
    (localStorage.getItem('language') as Language) ?? 'en'
  );
  const [currency, setCurrencyState] = useState<Currency>(() =>
    (localStorage.getItem('currency') as Currency) ?? 'BIF'
  );
  const [currencyRates, setCurrencyRates] = useState<LiveCurrencyRates | null>(null);
  const [currencyRatesLoading, setCurrencyRatesLoading] = useState(true);
  const [currencyRatesError, setCurrencyRatesError] = useState(false);
  const [currencyRatesAttempt, setCurrencyRatesAttempt] = useState(0);
  const [appName, setAppName] = useState('Iwacusystem');
  const [appLogoUrl, setAppLogoUrl] = useState('/iwacu-mark-512.png');
  const [propertyPhone, setPropertyPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [staffCardFooter, setStaffCardFooter] = useState(DEFAULT_STAFF_CARD_FOOTER);
  const [staffCardFooterFr, setStaffCardFooterFr] = useState(DEFAULT_STAFF_CARD_FOOTER_FR);
  const [loginBackgroundUrl, setLoginBackgroundUrl] = useState('');
  const [loginFamilyImageUrl, setLoginFamilyImageUrl] = useState('');

  useEffect(() => {
    supabase.from('settings').select('key, value').in('key', [
      'app_name',
      'logo_url',
      'property_phone',
      'property_address',
      'staff_card_footer',
      'staff_card_footer_fr',
      'login_bg_url',
      'login_family_image_url',
    ]).then(({ data, error }) => {
      if (error) {
        console.error('Unable to load public branding settings:', error.message);
        return;
      }
      const settings = Object.fromEntries((data ?? []).map(({ key, value }) => [key, value ?? '']));
      if (settings.app_name) setAppName(settings.app_name);
      if (settings.logo_url) setAppLogoUrl(settings.logo_url);
      if (settings.property_phone) setPropertyPhone(settings.property_phone);
      if (settings.property_address) setPropertyAddress(settings.property_address);
      if (settings.staff_card_footer) setStaffCardFooter(settings.staff_card_footer);
      if (settings.staff_card_footer_fr) setStaffCardFooterFr(settings.staff_card_footer_fr);
      if (settings.login_bg_url) setLoginBackgroundUrl(settings.login_bg_url);
      if (settings.login_family_image_url) setLoginFamilyImageUrl(settings.login_family_image_url);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => setLang(lang);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem('currency', c);
  };

  useEffect(() => {
    let cancelled = false;
    const loadRates = async () => {
      setCurrencyRatesLoading(true);
      setCurrencyRatesError(false);
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/BIF');
        if (!response.ok) throw new Error(`Exchange rate request failed: ${response.status}`);
        const data = await response.json() as ExchangeRateResponse;
        const rates = data.rates ?? {};
        const { KES, USD, EUR, RWF, UGX, TZS, CDF } = rates;
        const isValidRate = (rate: number | undefined): rate is number =>
          typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
        if (data.result !== 'success' || data.base_code !== 'BIF' ||
          !isValidRate(KES) || !isValidRate(USD) || !isValidRate(EUR) ||
          !isValidRate(RWF) || !isValidRate(UGX) || !isValidRate(TZS) || !isValidRate(CDF)) {
          throw new Error('Exchange rate response was invalid');
        }
        const currencyRates: LiveCurrencyRates = {
          KSh: KES,
          USD,
          EUR,
          Frw: RWF,
          Ugx: UGX,
          Tsh: TZS,
          Cdf: CDF,
        };
        if (!cancelled) setCurrencyRates(currencyRates);
      } catch (error) {
        console.error('Unable to load live currency exchange rates:', error);
        if (!cancelled) setCurrencyRatesError(true);
      } finally {
        if (!cancelled) setCurrencyRatesLoading(false);
      }
    };
    void loadRates();
    return () => { cancelled = true; };
  }, [currencyRatesAttempt]);

  const updateBranding: ThemeContextValue['updateBranding'] = branding => {
    if (branding.appName !== undefined) setAppName(branding.appName);
    if (branding.appLogoUrl !== undefined) setAppLogoUrl(branding.appLogoUrl || '/iwacu-mark-512.png');
    if (branding.propertyPhone !== undefined) setPropertyPhone(branding.propertyPhone);
    if (branding.propertyAddress !== undefined) setPropertyAddress(branding.propertyAddress);
    if (branding.staffCardFooter !== undefined) setStaffCardFooter(branding.staffCardFooter || DEFAULT_STAFF_CARD_FOOTER);
    if (branding.staffCardFooterFr !== undefined) setStaffCardFooterFr(branding.staffCardFooterFr || DEFAULT_STAFF_CARD_FOOTER_FR);
    if (branding.loginBackgroundUrl !== undefined) setLoginBackgroundUrl(branding.loginBackgroundUrl);
    if (branding.loginFamilyImageUrl !== undefined) setLoginFamilyImageUrl(branding.loginFamilyImageUrl);
  };

  useEffect(() => {
    document.title = `${appName} | Gestion locative au Burundi`;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) favicon.href = appLogoUrl;
  }, [appName, appLogoUrl]);

  const t = useCallback((key: string) => translations[language][key] ?? key, [language]);

  const fmt = (n: number) => {
    const rate = currency === 'BIF' ? 1 : currencyRates?.[currency];
    if (rate === undefined) {
      return `Fbu ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    const amount = n * rate;
    const digits = currency === 'BIF' ? 0 : 2;
    return `${CURRENCY_SYMBOLS[currency]} ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    })}`;
  };

  return (
    <ThemeContext.Provider value={{
      language, setLanguage, t, currency, setCurrency,
      currencyRatesAvailable: currencyRates !== null,
      currencyRatesLoading,
      currencyRatesError,
      refreshCurrencyRates: () => setCurrencyRatesAttempt(attempt => attempt + 1),
      fmt,
      appName, appLogoUrl, propertyPhone, propertyAddress, staffCardFooter, staffCardFooterFr, loginBackgroundUrl, loginFamilyImageUrl, updateBranding,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
