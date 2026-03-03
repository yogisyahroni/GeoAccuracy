package service

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"geoaccuracy-backend/internal/domain"
)

// --- Mock Implementations using Interface Embedding ---

type mockDSSvc struct {
	DataSourceService
	ListAllPipelinesFunc func(ctx context.Context) ([]domain.TransformationPipeline, error)
}

func (m *mockDSSvc) ListAllPipelines(ctx context.Context) ([]domain.TransformationPipeline, error) {
	if m.ListAllPipelinesFunc != nil {
		return m.ListAllPipelinesFunc(ctx)
	}
	return nil, nil
}

type mockETLSvc struct {
	ETLService
	ExecutePipelineStreamFunc func(ctx context.Context, p *domain.TransformationPipeline, batchSize int, processBatch func([]domain.ValidationRequestItem) error) error
}

func (m *mockETLSvc) ExecutePipelineStream(ctx context.Context, p *domain.TransformationPipeline, batchSize int, processBatch func([]domain.ValidationRequestItem) error) error {
	if m.ExecutePipelineStreamFunc != nil {
		return m.ExecutePipelineStreamFunc(ctx, p, batchSize, processBatch)
	}
	return nil
}

type mockCompSvc struct {
	ComparisonService
	ValidateSingleFunc func(ctx context.Context, userID int, req domain.ValidationRequestItem) domain.ValidationResult
	SaveSessionFunc    func(s *domain.ComparisonSession) error
}

func (m *mockCompSvc) ValidateSingle(ctx context.Context, userID int, req domain.ValidationRequestItem) domain.ValidationResult {
	if m.ValidateSingleFunc != nil {
		return m.ValidateSingleFunc(ctx, userID, req)
	}
	return domain.ValidationResult{}
}

func (m *mockCompSvc) SaveSession(s *domain.ComparisonSession) error {
	if m.SaveSessionFunc != nil {
		return m.SaveSessionFunc(s)
	}
	return nil
}

type mockERPSvc struct {
	domain.ErpIntegrationService
	ListAllInternalFunc func(ctx context.Context) ([]domain.ErpIntegration, error)
	ExecuteSyncJobFunc  func(ctx context.Context, id int64) error
}

func (m *mockERPSvc) ListAllInternal(ctx context.Context) ([]domain.ErpIntegration, error) {
	if m.ListAllInternalFunc != nil {
		return m.ListAllInternalFunc(ctx)
	}
	return nil, nil
}

func (m *mockERPSvc) ExecuteSyncJob(ctx context.Context, id int64) error {
	if m.ExecuteSyncJobFunc != nil {
		return m.ExecuteSyncJobFunc(ctx, id)
	}
	return nil
}

// --- Test Suite ---

func TestScheduler_StartStop(t *testing.T) {
	svc := NewSchedulerService(&mockDSSvc{}, &mockETLSvc{}, &mockCompSvc{}, &mockERPSvc{})

	// Should not panic
	svc.Start()
	time.Sleep(10 * time.Millisecond)
	svc.Stop()
}

func TestScheduler_AddRemovePipelineJob(t *testing.T) {
	svc := NewSchedulerService(&mockDSSvc{}, &mockETLSvc{}, &mockCompSvc{}, &mockERPSvc{}).(*schedulerService)
	svc.Start()
	defer svc.Stop()

	ctx := context.Background()

	cfg := PipelineConfigExt{
		Cron:       "@midnight", // Valid daily cron
		CronActive: true,
	}
	b, _ := json.Marshal(cfg)

	pipeline := domain.TransformationPipeline{
		ID:     101,
		UserID: 1,
		Name:   "Daily DB Sync",
		Config: b,
	}

	// 1. Add Job
	err := svc.AddOrUpdateJob(ctx, pipeline)
	assert.NoError(t, err)

	svc.mu.RLock()
	_, exists := svc.jobs["pipeline-101"]
	svc.mu.RUnlock()
	assert.True(t, exists, "Job should exist in map")

	// 2. Remove Job
	svc.RemoveJob(101)

	svc.mu.RLock()
	_, exists = svc.jobs["pipeline-101"]
	svc.mu.RUnlock()
	assert.False(t, exists, "Job should be removed")
}

func TestScheduler_PipelineJobExecution_Simulated(t *testing.T) {
	var etlCalled bool
	var mu sync.Mutex

	mETL := &mockETLSvc{
		ExecutePipelineStreamFunc: func(ctx context.Context, p *domain.TransformationPipeline, batchSize int, processBatch func([]domain.ValidationRequestItem) error) error {
			mu.Lock()
			etlCalled = true
			mu.Unlock()

			// Simulate processing 2 items to ensure no panics and callback works
			_ = processBatch([]domain.ValidationRequestItem{
				{SystemAddress: "Addr 1"},
				{SystemAddress: "Addr 2"},
			})
			return nil
		},
	}

	mComp := &mockCompSvc{
		ValidateSingleFunc: func(ctx context.Context, userID int, req domain.ValidationRequestItem) domain.ValidationResult {
			return domain.ValidationResult{AccuracyLevel: "accurate"} // Mock returning accurate
		},
		SaveSessionFunc: func(s *domain.ComparisonSession) error {
			assert.Equal(t, 2, s.TotalCount)
			assert.Equal(t, 2, s.AccurateCount)
			assert.Equal(t, 0, s.ErrorCount)
			return nil
		},
	}

	svc := NewSchedulerService(&mockDSSvc{}, mETL, mComp, &mockERPSvc{}).(*schedulerService)
	svc.Start()
	defer svc.Stop()

	// Simulate invocation explicitly by extracting the cron runner entries
	// since we cannot wait a full minute in unit tests.

	cfg := PipelineConfigExt{
		Cron:       "@hourly",
		CronActive: true,
	}
	b, _ := json.Marshal(cfg)

	pipeline := domain.TransformationPipeline{
		ID:     99,
		UserID: 1,
		Config: b,
	}

	_ = svc.AddOrUpdateJob(context.Background(), pipeline)

	// Trigger the job manually using Robfig Cron's .Entries()
	entries := svc.cronRunner.Entries()
	assert.Len(t, entries, 1)

	// This safely invokes the defined Job payload function synchronously
	entries[0].Job.Run()

	mu.Lock()
	assert.True(t, etlCalled, "ETL stream logic must fire without panic")
	mu.Unlock()
}

func TestScheduler_PipelineErrorRecovery(t *testing.T) {
	// Ensures that if ETL Panics (race condition or bad 3rd party config), the panic is contained (or normal error is handled gracefully)
	mETL := &mockETLSvc{
		ExecutePipelineStreamFunc: func(ctx context.Context, p *domain.TransformationPipeline, batchSize int, processBatch func([]domain.ValidationRequestItem) error) error {
			return errors.New("simulated remote server crash")
		},
	}

	mComp := &mockCompSvc{
		SaveSessionFunc: func(s *domain.ComparisonSession) error {
			t.Fatal("Should not save session on ETL execution pipeline error")
			return nil
		},
	}

	svc := NewSchedulerService(&mockDSSvc{}, mETL, mComp, &mockERPSvc{}).(*schedulerService)
	svc.Start()
	defer svc.Stop()

	cfg := PipelineConfigExt{
		Cron:       "@hourly",
		CronActive: true,
	}
	b, _ := json.Marshal(cfg)
	_ = svc.AddOrUpdateJob(context.Background(), domain.TransformationPipeline{ID: 10, Config: b})

	// Invoke
	entries := svc.cronRunner.Entries()
	assert.Len(t, entries, 1)

	// Since we mock it returning an error, this should gracefully log and return, without panicking test
	assert.NotPanics(t, func() {
		entries[0].Job.Run()
	})
}

// --- ERP Scheduling ---
func TestScheduler_ErpIntegration(t *testing.T) {
	var erpCalled bool
	mERP := &mockERPSvc{
		ExecuteSyncJobFunc: func(ctx context.Context, id int64) error {
			erpCalled = true
			return nil
		},
	}

	svc := NewSchedulerService(&mockDSSvc{}, &mockETLSvc{}, &mockCompSvc{}, mERP).(*schedulerService)
	svc.Start()
	defer svc.Stop()

	_ = svc.AddOrUpdateErpJob(context.Background(), domain.ErpIntegration{
		ID:           5,
		CronSchedule: "@daily",
		Name:         "SAP Sync",
	})

	entries := svc.cronRunner.Entries()
	assert.Len(t, entries, 1)

	// Execute safely without waiting
	entries[0].Job.Run()
	assert.True(t, erpCalled)

	// Remove job
	svc.RemoveErpJob(5)
	assert.Len(t, svc.cronRunner.Entries(), 0)
}
