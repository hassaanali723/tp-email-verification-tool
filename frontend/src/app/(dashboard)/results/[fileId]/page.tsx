import ValidationResultsOverview from '@/components/validation/ValidationResultsOverview';
import EmailResultsList from '@/components/validation/EmailResultsList';
import ResultsFilters from '@/components/validation/ResultsFilters';
import DownloadButton from '@/components/validation/DownloadButton';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

interface ResultsPageProps {
  params: { fileId: string }
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { fileId } = params;

  if (!fileId) return notFound();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <ValidationResultsOverview fileId={fileId} />
      <div className="flex items-center justify-between">
        <ResultsFilters fileId={fileId} />
        <DownloadButton fileId={fileId} />
      </div>
      <Suspense fallback={<div>Loading emails...</div>}>
        <EmailResultsList fileId={fileId} />
      </Suspense>
    </div>
  );
} 