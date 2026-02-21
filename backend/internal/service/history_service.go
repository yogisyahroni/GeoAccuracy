package service

import (
	"fmt"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
)

// HistoryService handles comparison session history.
type HistoryService struct {
	repo *repository.HistoryRepository
}

// NewHistoryService creates a new HistoryService.
func NewHistoryService(repo *repository.HistoryRepository) *HistoryService {
	return &HistoryService{repo: repo}
}

// SaveSession persists the result summary of a comparison batch.
func (s *HistoryService) SaveSession(session *domain.ComparisonSession) error {
	if err := s.repo.Save(session); err != nil {
		return fmt.Errorf("history service SaveSession: %w", err)
	}
	return nil
}

// ListSessions returns a paginated list of sessions for a user.
func (s *HistoryService) ListSessions(userID, page, pageSize int) (*domain.ListSessionsResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	sessions, total, err := s.repo.ListByUserID(userID, page, pageSize)
	if err != nil {
		return nil, fmt.Errorf("history service ListSessions: %w", err)
	}

	return &domain.ListSessionsResponse{
		Sessions: sessions,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

// GetAnalytics calculates and returns aggregated historical analytics for a user.
func (s *HistoryService) GetAnalytics(userID int) (*domain.AnalyticsData, error) {
	agg, err := s.repo.GetAnalytics(userID)
	if err != nil {
		return nil, fmt.Errorf("history service GetAnalytics: %w", err)
	}
	return agg, nil
}
