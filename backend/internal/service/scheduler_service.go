package service

import (
	"context"
	"encoding/json"
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
}

type schedulerService struct {
	dsService   DataSourceService
	etlService  ETLService
	compService ComparisonService
	cronRunner  *cron.Cron
	jobs        map[int64]cron.EntryID
	mu          sync.RWMutex
}

func NewSchedulerService(ds DataSourceService, etl ETLService, comp ComparisonService) SchedulerService {
	return &schedulerService{
		dsService:   ds,
		etlService:  etl,
		compService: comp,
		cronRunner:  cron.New(), // Standard cron expression
		jobs:        make(map[int64]cron.EntryID),
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

	// Check if exists, remove first
	if entryID, exists := s.jobs[p.ID]; exists {
		s.cronRunner.Remove(entryID)
		delete(s.jobs, p.ID)
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

	s.jobs[p.ID] = entryID
	log.Printf("Successfully scheduled pipeline [%d] with cron '%s'", p.ID, ext.Cron)
	return nil
}

func (s *schedulerService) RemoveJob(pipelineID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if entryID, exists := s.jobs[pipelineID]; exists {
		s.cronRunner.Remove(entryID)
		delete(s.jobs, pipelineID)
		log.Printf("Removed scheduled job for pipeline [%d]", pipelineID)
	}
}
