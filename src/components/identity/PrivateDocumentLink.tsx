import React, { useEffect, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function PrivateDocumentLink({ path, label }: { path?: string | null; label: string }) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setViewUrl(null);
      setDownloadUrl(null);
      setError(null);
      return;
    }
    const extension = path.split('.').pop()?.toLowerCase();
    const normalizedLabel = label.toLowerCase();
    const fileBaseName = normalizedLabel.includes('signature')
      ? 'signature'
      : normalizedLabel.includes('profile photo')
        ? 'profile-photo'
        : 'identity-document';
    const downloadName = extension === 'pdf'
      ? `${fileBaseName}.pdf`
      : extension === 'png'
        ? `${fileBaseName}.png`
        : extension === 'svg'
          ? `${fileBaseName}.svg`
        : `${fileBaseName}.jpg`;
    Promise.all([
      supabase.storage.from('identity-documents').createSignedUrl(path, 300),
      supabase.storage.from('identity-documents').createSignedUrl(
        path,
        300,
        { download: downloadName },
      ),
    ]).then(([viewResult, downloadResult]) => {
      if (cancelled) return;
      const linkError = viewResult.error ?? downloadResult.error;
      if (linkError || !viewResult.data || !downloadResult.data) {
        setError(linkError?.message ?? 'The document links could not be created.');
        return;
      }
      setViewUrl(viewResult.data.signedUrl);
      setDownloadUrl(downloadResult.data.signedUrl);
    }).catch((caught: unknown) => {
      if (cancelled) return;
      setError(caught instanceof Error ? caught.message : 'The secure document links could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [path, label]);

  if (!path) return <span className="text-sm text-slate-500">No document uploaded</span>;
  if (error) return <span role="alert" className="text-sm text-red-700">Unable to open document: {error}</span>;
  if (!viewUrl || !downloadUrl) return <span className="text-sm text-slate-500">Preparing secure document links…</span>;

  return (
    <div className="flex flex-wrap gap-3">
      <a href={viewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
        <ExternalLink className="h-4 w-4" /> View {label}
      </a>
      <a href={downloadUrl} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
        <Download className="h-4 w-4" /> Download {label}
      </a>
    </div>
  );
}
