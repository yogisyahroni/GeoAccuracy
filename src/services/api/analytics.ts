import { request } from '@/lib/api';

export interface CourierAccuracyAgg {
    courier_id: string;
    total_deliveries: number;
    accurate_count: number;
    fairly_count: number;
    inaccurate_count: number;
    error_count: number;
    accuracy_rate: number;
}

export interface SLATrendAgg {
    date: string;
    on_time_count: number;
    late_count: number;
    total_count: number;
    on_time_rate: number;
}

/**
 * Fetch Courier Leaderboard based on Accuracy
 */
export const getCourierLeaderboard = async (limit: number = 10) => {
    return request<CourierAccuracyAgg[]>('GET', `/api/advanced-analytics/couriers?limit=${limit}`);
};

/**
 * Fetch SLA Trends over customized days range
 */
export const getSLATrends = async (days: number = 7) => {
    return request<SLATrendAgg[]>('GET', `/api/advanced-analytics/sla?days=${days}`);
};
