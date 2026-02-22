package repository

import (
	"context"
	"fmt"
	"geoaccuracy-backend/internal/domain"

	"github.com/jmoiron/sqlx"
)

// analyticsRepository implements domain.AnalyticsRepository
type analyticsRepository struct {
	db *sqlx.DB
}

// NewAnalyticsRepository creates a new AnalyticsRepository.
func NewAnalyticsRepository(db *sqlx.DB) domain.AnalyticsRepository {
	return &analyticsRepository{db: db}
}

// SaveCourierPerformance persists a new courier performance record.
func (r *analyticsRepository) SaveCourierPerformance(ctx context.Context, cp *domain.CourierPerformance) error {
	query := `
		INSERT INTO courier_performance (
			user_id, batch_id, courier_id, order_id, 
			reported_lat, reported_lng, actual_lat, actual_lng, 
			distance_variance_meters, accuracy_status, sla_status, event_timestamp
		) VALUES (
			:user_id, :batch_id, :courier_id, :order_id,
			:reported_lat, :reported_lng, :actual_lat, :actual_lng,
			:distance_variance_meters, :accuracy_status, :sla_status, :event_timestamp
		) RETURNING id, created_at
	`
	rows, err := r.db.NamedQueryContext(ctx, query, cp)
	if err != nil {
		return fmt.Errorf("failed to insert courier_performance: %w", err)
	}
	defer rows.Close()

	if rows.Next() {
		if err := rows.StructScan(cp); err != nil {
			return fmt.Errorf("failed to scan returned id/created_at: %w", err)
		}
	}
	return nil
}

// GetCourierLeaderboard fetches courier metrics aggregated by courier_id.
// Ordered by total accurate deliveries.
func (r *analyticsRepository) GetCourierLeaderboard(ctx context.Context, userID int64, limit int) ([]domain.CourierAccuracyAgg, error) {
	if limit <= 0 {
		limit = 10
	}
	query := `
		SELECT 
			courier_id,
			COUNT(*) as total_deliveries,
			COUNT(*) FILTER (WHERE accuracy_status = 'accurate') as accurate_count,
			COUNT(*) FILTER (WHERE accuracy_status = 'fairly_accurate') as fairly_count,
			COUNT(*) FILTER (WHERE accuracy_status = 'inaccurate') as inaccurate_count,
			COUNT(*) FILTER (WHERE accuracy_status = 'error') as error_count,
			ROUND(
				(COUNT(*) FILTER (WHERE accuracy_status = 'accurate')::numeric / COUNT(*)) * 100, 
			2) as accuracy_rate
		FROM courier_performance
		WHERE user_id = $1
		GROUP BY courier_id
		ORDER BY accurate_count DESC, accuracy_rate DESC
		LIMIT $2
	`
	var leaderboard []domain.CourierAccuracyAgg
	if err := r.db.SelectContext(ctx, &leaderboard, query, userID, limit); err != nil {
		return nil, fmt.Errorf("failed to fetch courier leaderboard: %w", err)
	}

	return leaderboard, nil
}

// GetSLATrends gets daily aggregated data of on-time vs late metrics.
func (r *analyticsRepository) GetSLATrends(ctx context.Context, userID int64, days int) ([]domain.SLATrendAgg, error) {
	if days <= 0 {
		days = 7
	}
	// Note: We use the event_timestamp (when the delivery happened) for trends.
	query := `
		SELECT 
			TO_CHAR(DATE(event_timestamp), 'YYYY-MM-DD') as date,
			COUNT(*) FILTER (WHERE sla_status = 'on_time') as on_time_count,
			COUNT(*) FILTER (WHERE sla_status = 'late') as late_count,
			COUNT(*) as total_count,
			ROUND(
				(COUNT(*) FILTER (WHERE sla_status = 'on_time')::numeric / NULLIF(COUNT(*), 0)) * 100, 
			2) as on_time_rate
		FROM courier_performance
		WHERE user_id = $1 AND event_timestamp >= CURRENT_DATE - ($2 || ' days')::INTERVAL
		GROUP BY DATE(event_timestamp)
		ORDER BY DATE(event_timestamp) ASC
	`
	var trends []domain.SLATrendAgg
	if err := r.db.SelectContext(ctx, &trends, query, userID, days); err != nil {
		return nil, fmt.Errorf("failed to fetch sla trends: %w", err)
	}

	// Make sure on_time_rate isn't null in Go if there were 0 rows (though GROUP BY filters empty)
	for i := range trends {
		if trends[i].TotalCount == 0 {
			trends[i].OnTimeRate = 0
		}
	}

	return trends, nil
}
