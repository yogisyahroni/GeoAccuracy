package repository

import (
	"database/sql"
	"fmt"

	"geoaccuracy-backend/internal/domain"
)

// HistoryRepository handles comparison_sessions table operations.
type HistoryRepository struct {
	db *sql.DB
}

// NewHistoryRepository creates a new HistoryRepository.
func NewHistoryRepository(db *sql.DB) *HistoryRepository {
	return &HistoryRepository{db: db}
}

// Save persists a new comparison session.
func (r *HistoryRepository) Save(s *domain.ComparisonSession) error {
	return r.db.QueryRow(
		`INSERT INTO comparison_sessions
		 (user_id, total_count, accurate_count, fairly_count, inaccurate_count, error_count)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 RETURNING id, created_at`,
		s.UserID, s.TotalCount, s.AccurateCount, s.FairlyCount, s.InaccurateCount, s.ErrorCount,
	).Scan(&s.ID, &s.CreatedAt)
}

// ListByUserID returns paginated sessions for a user (newest first).
func (r *HistoryRepository) ListByUserID(userID, page, pageSize int) ([]domain.ComparisonSession, int, error) {
	var total int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM comparison_sessions WHERE user_id = $1`, userID,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("history repository count: %w", err)
	}

	offset := (page - 1) * pageSize
	rows, err := r.db.Query(
		`SELECT id, user_id, total_count, accurate_count, fairly_count, inaccurate_count, error_count, created_at
		 FROM comparison_sessions
		 WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		userID, pageSize, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("history repository list: %w", err)
	}
	defer rows.Close()

	var sessions []domain.ComparisonSession
	for rows.Next() {
		var s domain.ComparisonSession
		if err := rows.Scan(
			&s.ID, &s.UserID, &s.TotalCount, &s.AccurateCount, &s.FairlyCount, &s.InaccurateCount, &s.ErrorCount, &s.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("history repository scan: %w", err)
		}
		sessions = append(sessions, s)
	}
	if sessions == nil {
		sessions = []domain.ComparisonSession{}
	}
	return sessions, total, nil
}

// GetAnalytics calculates aggregated statistics and fetches recent sessions for a user.
func (r *HistoryRepository) GetAnalytics(userID int) (*domain.AnalyticsData, error) {
	var agg domain.AnalyticsData

	// 1. Aggregate stats
	err := r.db.QueryRow(
		`SELECT 
			COUNT(*),
			COALESCE(SUM(total_count), 0),
			COALESCE(SUM(accurate_count), 0),
			COALESCE(SUM(fairly_count), 0),
			COALESCE(SUM(inaccurate_count), 0),
			COALESCE(SUM(error_count), 0)
		 FROM comparison_sessions 
		 WHERE user_id = $1`,
		userID,
	).Scan(
		&agg.TotalSessions,
		&agg.TotalRecords,
		&agg.TotalAccurate,
		&agg.TotalFairly,
		&agg.TotalInaccurate,
		&agg.TotalError,
	)

	if err != nil {
		return nil, fmt.Errorf("history repo GetAnalytics aggregate: %w", err)
	}

	if agg.TotalRecords > 0 {
		agg.AvgAccuracyRate = int((float64(agg.TotalAccurate) / float64(agg.TotalRecords)) * 100)
	}

	// 2. Fetch last 10 sessions for trend chart
	rows, err := r.db.Query(
		`SELECT id, user_id, total_count, accurate_count, fairly_count, inaccurate_count, error_count, created_at
		 FROM comparison_sessions
		 WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT 10`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("history repo GetAnalytics recent sessions: %w", err)
	}
	defer rows.Close()

	var recent []domain.ComparisonSession
	for rows.Next() {
		var s domain.ComparisonSession
		if err := rows.Scan(
			&s.ID, &s.UserID, &s.TotalCount, &s.AccurateCount, &s.FairlyCount, &s.InaccurateCount, &s.ErrorCount, &s.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("history repo scan recent sessions: %w", err)
		}
		recent = append(recent, s)
	}
	if recent == nil {
		recent = []domain.ComparisonSession{}
	}

	agg.RecentSessions = recent
	return &agg, nil
}
