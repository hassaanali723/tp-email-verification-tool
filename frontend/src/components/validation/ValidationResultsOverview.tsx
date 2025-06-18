'use client';
import React, { useEffect } from 'react';
import { useValidationResultsStore } from '@/store/validation-results-store';
import { useAuth } from '@clerk/nextjs';
import { Card } from '@/components/ui/card';
import { ProgressCircle } from '@/components/ui/progress-circle';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Clock,
  XCircle,
  AlertOctagon,
  Ban,
  ShieldAlert,
  ThermometerSun,
  WifiOff,
  Timer,
  ServerCrash,
  AlertTriangleIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationResultsOverviewProps {
  fileId: string;
}

interface CategoryCardProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  categories?: Record<string, number>;
  categoryIcons?: Record<string, React.ReactNode>;
  categoryLabels?: Record<string, string>;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  title,
  count,
  icon,
  bgColor,
  textColor,
  categories,
  categoryIcons,
  categoryLabels
}) => {
  return (
    <div className={cn(
      "flex flex-col rounded-lg transition-all duration-200",
      bgColor
    )}>
      {/* Header */}
      <div className="p-4 border-b border-opacity-10" style={{ borderColor: textColor }}>
        <div className="flex items-center space-x-3">
          {icon}
          <div>
            <div className={cn("text-2xl font-bold tracking-tight", textColor)}>
              {count}
            </div>
            <div className={cn("text-sm font-medium", textColor)}>
              {title}
            </div>
          </div>
        </div>
      </div>

      {/* Categories */}
      {categories && (
        <div className="p-3 space-y-2">
          {Object.entries(categories).map(([key, value]) => (
            <div 
              key={key} 
              className={cn(
                "flex items-center justify-between p-2 rounded",
                "bg-white bg-opacity-50 hover:bg-opacity-70 transition-colors",
                "shadow-sm"
              )}
            >
              <div className="flex items-center space-x-2">
                {categoryIcons?.[key] && (
                  <div className={textColor}>
                    {categoryIcons[key]}
                  </div>
                )}
                <span className={cn("text-sm font-medium", textColor)}>
                  {categoryLabels?.[key] || key.replace(/_/g, ' ')}
                </span>
              </div>
              <div className={cn(
                "px-2 py-0.5 rounded text-sm font-semibold",
                value > 0 ? `${textColor} bg-opacity-10 ${bgColor}` : "text-gray-400"
              )}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function ValidationResultsOverview({ fileId }: ValidationResultsOverviewProps) {
  const { getToken } = useAuth();
  const { 
    stats, 
    loadingStats,
    errorStats,
    fetchStats,
    subscribeToUpdates,
    unsubscribeFromUpdates
  } = useValidationResultsStore();

  useEffect(() => {
    const fetchInitialStats = async () => {
      const token = await getToken();
      if (token) {
        await fetchStats(fileId, token);
      }
    };

    fetchInitialStats();
  }, [fileId, fetchStats, getToken]);

  useEffect(() => {
    const setupSSE = async () => {
      if (stats?.status === 'processing') {
        console.log('Setting up real-time updates for validation results');
        subscribeToUpdates(fileId, getToken);
      }
    };

    setupSSE();

    return () => {
      console.log('Cleaning up validation results SSE connection');
      unsubscribeFromUpdates();
    };
  }, [fileId, stats?.status, getToken, subscribeToUpdates, unsubscribeFromUpdates]);

  if (loadingStats) {
    return (
      <Card className="p-6">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </Card>
    );
  }

  if (errorStats) {
    return (
      <Card className="p-6">
        <div className="text-red-500">{errorStats}</div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="p-6">
        <div>No validation results available</div>
      </Card>
    );
  }

  const categoryIcons = {
    // Undeliverable categories
    invalid_email: <XCircle className="h-4 w-4" />,
    invalid_domain: <AlertOctagon className="h-4 w-4" />,
    rejected_email: <Ban className="h-4 w-4" />,
    invalid_smtp: <ServerCrash className="h-4 w-4" />,

    // Risky categories
    low_quality: <ShieldAlert className="h-4 w-4" />,
    low_deliverability: <ThermometerSun className="h-4 w-4" />,

    // Unknown categories
    no_connect: <WifiOff className="h-4 w-4" />,
    timeout: <Timer className="h-4 w-4" />,
    unavailable_smtp: <ServerCrash className="h-4 w-4" />,
    unexpected_error: <AlertTriangleIcon className="h-4 w-4" />
  };

  const categoryLabels = {
    invalid_email: 'Invalid Email Format',
    invalid_domain: 'Invalid Domain',
    rejected_email: 'Rejected Email',
    invalid_smtp: 'Invalid SMTP',
    low_quality: 'Low Quality',
    low_deliverability: 'Low Deliverability',
    no_connect: 'Connection Failed',
    timeout: 'Timeout',
    unavailable_smtp: 'SMTP Unavailable',
    unexpected_error: 'Unexpected Error'
  };

  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Progress Circle */}
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-sm">
          <ProgressCircle 
            value={stats.progress?.percentage || 0} 
            size="lg"
            className="mb-3"
          />
          <span className="text-lg font-semibold text-gray-900">
            {stats.progress?.processed || 0} of {stats.progress?.total || 0}
          </span>
          <span className="text-sm text-gray-500">Emails Processed</span>
        </div>

        {/* Stats Grid */}
        <CategoryCard
          title="Deliverable"
          count={stats.stats?.deliverable?.count || 0}
          icon={<CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />}
          bgColor="bg-green-50"
          textColor="text-green-700"
        />

        <CategoryCard
          title="Undeliverable"
          count={stats.stats?.undeliverable?.count || 0}
          icon={<AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0" />}
          bgColor="bg-red-50"
          textColor="text-red-700"
          categories={stats.stats?.undeliverable?.categories}
          categoryIcons={categoryIcons}
          categoryLabels={categoryLabels}
        />

        <CategoryCard
          title="Risky"
          count={stats.stats?.risky?.count || 0}
          icon={<AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0" />}
          bgColor="bg-yellow-50"
          textColor="text-yellow-700"
          categories={stats.stats?.risky?.categories}
          categoryIcons={categoryIcons}
          categoryLabels={categoryLabels}
        />

        <CategoryCard
          title="Unknown"
          count={stats.stats?.unknown?.count || 0}
          icon={<Clock className="h-6 w-6 text-gray-500 flex-shrink-0" />}
          bgColor="bg-gray-50"
          textColor="text-gray-700"
          categories={stats.stats?.unknown?.categories}
          categoryIcons={categoryIcons}
          categoryLabels={categoryLabels}
        />
      </div>
    </Card>
  );
} 