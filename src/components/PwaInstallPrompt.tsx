import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'propmanager-install-prompt-dismissed';

export default function PwaInstallPrompt() {
  const { appName, appLogoUrl } = useTheme();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (isStandalone) return;

    const userAgent = navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (iosDevice) {
      setIsIos(true);
      const timer = window.setTimeout(() => setVisible(true), 1200);
      return () => window.clearTimeout(timer);
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      setVisible(true);
    };
    const handleInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setVisible(false);
  };

  if (!visible) return null;

  const isFrench = navigator.language.toLowerCase().startsWith('fr');

  return (
    <aside
      aria-label={isFrench ? `Installer l’application ${appName}` : `Install the ${appName} app`}
      className="fixed top-3 left-1/2 z-[100] flex w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#151515]/95 p-3 text-white shadow-2xl backdrop-blur-xl sm:top-5 sm:p-4"
    >
      <img src={appLogoUrl} alt="" className="h-11 w-11 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {isFrench ? `Installer ${appName}` : `Install ${appName}`}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/60">
          {isIos
            ? (isFrench
              ? 'Touchez Partager, puis « Sur l’écran d’accueil ».'
              : 'Tap Share, then “Add to Home Screen”.')
            : (isFrench
              ? 'Ajoutez l’application à votre écran d’accueil.'
              : 'Add the app to your home screen for quick access.')}
        </p>
      </div>
      {isIos ? (
        <Share2 className="h-5 w-5 shrink-0 text-white/70" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={install}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-white/80"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isFrench ? 'Installer' : 'Install'}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label={isFrench ? 'Fermer' : 'Dismiss'}
        className="self-start rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
