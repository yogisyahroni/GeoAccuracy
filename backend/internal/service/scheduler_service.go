package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"geoaccuracy-backend/internal/domain"

	"github.com/robfig/cron/v3"
)

type PipelineConfigExt struct {
	Cron       string `json:"cron,omitempty"`
	CronActive bool   `json:"cron_active,omitempty"`
}

type SchedulerService interface {
	Start()
	Stop()
	ReloadPipelines(ctx context.Context) error
	AddOrUpdateJob(ctx context.Context, p domain.TransformationPipeline) error
	RemoveJob(pipelineID int64)

	ReloadErpIntegrations(ctx context.Context) error
	AddOrUpdateErpJob(ctx context.Context, i domain.ErpIntegration) error
	RemoveErpJob(integrationID int64)
}

type schedulerService struct {
	dsService   DataSourceService
	etlService  ETLService
	compService ComparisonService
	erpService  domain.ErpIntegrationService
	cronRunner  *cron.Cron
	jobs        map[string]cron.EntryID // Use string keys like "pipeline-1", "erp-1"
	mu          sync.RWMutex
}

func NewSchedulerService(ds DataSourceService, etl ETLService, comp ComparisonService, erp domain.ErpIntegrationService) SchedulerService {
	return &schedulerService{
		dsService:   ds,
		etlService:  etl,
		compService: comp,
		erpService:  erp,
		cronRunner:  cron.New(), // Standard cron expression
		jobs:        make(map[string]cron.EntryID),
	}
}

func (s *schedulerService) Start() {
	s.cronRunner.Start()
	log.Println("SchedulerService started")
}

func (s *schedulerService) Stop() {
	s.cronRunner.Stop()
	log.Println("SchedulerService stopped")
}

func (s *schedulerService) ReloadPipelines(ctx context.Context) error {
	pipelines, err := s.dsService.ListAllPipelines(ctx)
	if err != nil {
		return err
	}

	for _, p := range pipelines {
		s.AddOrUpdateJob(ctx, p)
	}

	return nil
}

func (s *schedulerService) AddOrUpdateJob(ctx context.Context, p domain.TransformationPipeline) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := fmt.Sprintf("pipeline-%d", p.ID)

	// Check if exists, remove first
	if entryID, exists := s.jobs[key]; exists {
		s.cronRunner.Remove(entryID)
		delete(s.jobs, key)
	}

	var ext PipelineConfigExt
	if err := json.Unmarshal(p.Config, &ext); err != nil {
		return err
	}

	if !ext.CronActive || ext.Cron == "" {
		return nil // Not scheduled
	}

	entryID, err := s.cronRunner.AddFunc(ext.Cron, func() {
		log.Printf("Running scheduled pipeline [%d]: %s\n", p.ID, p.Name)

		// Create a background context for the job execution
		jobCtx := context.Background()

		session := &domain.ComparisonSession{UserID: int(p.UserID)}

		err := s.etlService.ExecutePipelineStream(jobCtx, &p, 1000, func(batch []domain.ValidationRequestItem) error {
			for _, item := range batch {
				res := s.compService.ValidateSingle(jobCtx, int(p.UserID), item)

				session.TotalCount++
				if res.Error != "" {
					session.ErrorCount++
				} else {
					switch res.AccuracyLevel {
					case "accurate":
						session.AccurateCount++
					case "fairly_accurate":
						session.FairlyCount++
					case "inaccurate":
						session.InaccurateCount++
					default:
						session.ErrorCount++
					}
				}
			}
			return nil
		})

		if err != nil {
			log.Printf("ERROR running scheduled pipeline [%d]: %v", p.ID, err)
		} else {
			log.Printf("SUCCESS running scheduled pipeline [%d]", p.ID)
			s.compService.SaveSession(session)
		}
	})

	if err != nil {
		log.Printf("Failed to schedule pipeline [%d]: %v", p.ID, err)
		return err
	}

	s.jobs[key] = entryID
	log.Printf("Successfully scheduled pipeline [%d] with cron '%s'", p.ID, ext.Cron)
	return nil
}

func (s *schedulerService) RemoveJob(pipelineID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := fmt.Sprintf("pipeline-%d", pipelineID)
	if entryID, exists := s.jobs[key]; exists {
		s.cronRunner.Remove(entryID)
		delete(s.jobs, key)
		log.Printf("Removed scheduled job for pipeline [%d]", pipelineID)
	}
}

// ---------------------------------------------------------
// ERP Integration Specific Scheduling Logic
// ---------------------------------------------------------

func (s *schedulerService) ReloadErpIntegrations(ctx context.Context) error {
	if s.erpService == nil {
		return nil
	}
	integrations, err := s.erpService.ListAllInternal(ctx)
	if err != nil {
		return err
	}

	for _, i := range integrations {
		s.AddOrUpdateErpJob(ctx, i)
	}
	return nil
}

func (s *schedulerService) AddOrUpdateErpJob(ctx context.Context, i domain.ErpIntegration) error {
	if s.erpService == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	key := fmt.Sprintf("erp-%d", i.ID)

	// Remove old job if exists
	if entryID, exists := s.jobs[key]; exists {
		s.cronRunner.Remove(entryID)
		delete(s.jobs, key)
	}

	// Wait, active / inactive might not be defined for ERP out of the box,
	// assuming any valid non-empty cron schedule is active.
	if i.CronSchedule == "" {
		return nil
	}

	entryID, err := s.cronRunner.AddFunc(i.CronSchedule, func() {
		log.Printf("Running scheduled ERP Sync [%d]: %s", i.ID, i.Name)
		jobCtx := context.Background()

		if err := s.erpService.ExecuteSyncJob(jobCtx, i.ID); err != nil {
			log.Printf("ERROR running scheduled ERP Sync [%d]: %v", i.ID, err)
		} else {
			log.Printf("SUCCESS running scheduled ERP Sync [%d]", i.ID)
		}
	})

	if err != nil {
		log.Printf("Failed to schedule ERP Sync [%d]: %v", i.ID, err)
		return err
	}

	s.jobs[key] = entryID
	log.Printf("Successfully scheduled ERP Sync [%d] with cron '%s'", i.ID, i.CronSchedule)
	return nil
}

func (s *schedulerService) RemoveErpJob(integrationID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := fmt.Sprintf("erp-%d", integrationID)
	if entryID, exists := s.jobs[key]; exists {
		s.cronRunner.Remove(entryID)
		delete(s.jobs, key)
		log.Printf("Removed scheduled job for ERP Sync [%d]", integrationID)
	}
}
