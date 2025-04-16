import React, { useEffect, useState } from 'react';
import { getValidationStats } from '../services/emailValidation';

const ValidationStats = ({ requestId }) => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getValidationStats(requestId);
                setStats(data);
                setError(null);
            } catch (err) {
                setError('Failed to fetch validation statistics');
                console.error(err);
            }
        };

        // Initial fetch
        fetchStats();

        // Set up polling every 2 seconds
        const interval = setInterval(fetchStats, 2000);

        // Cleanup
        return () => clearInterval(interval);
    }, [requestId]);

    if (error) {
        return <div className="text-red-600">{error}</div>;
    }

    if (!stats) {
        return <div>Loading statistics...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${stats.progress.percentage}%` }}
                ></div>
            </div>
            <div className="text-sm text-gray-600">
                Processed {stats.progress.processed} of {stats.progress.total} emails ({stats.progress.percentage}%)
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Deliverable */}
                <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-semibold text-green-700">Deliverable</h3>
                    <p className="text-2xl font-bold text-green-600">{stats.stats.deliverable.count}</p>
                </div>

                {/* Undeliverable */}
                <div className="p-4 bg-red-50 rounded-lg">
                    <h3 className="font-semibold text-red-700">Undeliverable</h3>
                    <p className="text-2xl font-bold text-red-600">{stats.stats.undeliverable.count}</p>
                    <div className="mt-2 text-sm">
                        <div>Invalid Email: {stats.stats.undeliverable.categories.invalid_email}</div>
                        <div>Invalid Domain: {stats.stats.undeliverable.categories.invalid_domain}</div>
                        <div>Rejected Email: {stats.stats.undeliverable.categories.rejected_email}</div>
                        <div>Invalid SMTP: {stats.stats.undeliverable.categories.invalid_smtp}</div>
                    </div>
                </div>

                {/* Risky */}
                <div className="p-4 bg-yellow-50 rounded-lg">
                    <h3 className="font-semibold text-yellow-700">Risky</h3>
                    <p className="text-2xl font-bold text-yellow-600">{stats.stats.risky.count}</p>
                    <div className="mt-2 text-sm">
                        <div>Low Quality: {stats.stats.risky.categories.low_quality}</div>
                        <div>Low Deliverability: {stats.stats.risky.categories.low_deliverability}</div>
                    </div>
                </div>

                {/* Unknown */}
                <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold text-gray-700">Unknown</h3>
                    <p className="text-2xl font-bold text-gray-600">{stats.stats.unknown.count}</p>
                    <div className="mt-2 text-sm">
                        <div>No Connect: {stats.stats.unknown.categories.no_connect}</div>
                        <div>Timeout: {stats.stats.unknown.categories.timeout}</div>
                        <div>Unavailable SMTP: {stats.stats.unknown.categories.unavailable_smtp}</div>
                        <div>Unexpected Error: {stats.stats.unknown.categories.unexpected_error}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ValidationStats; 