package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/pkg/crypto"
)

type erpIntegrationService struct {
	repo       domain.ErpIntegrationRepository
	cfg        *config.Config
	webhookSvc *WebhookService
	httpClient *http.Client
}

func NewErpIntegrationService(repo domain.ErpIntegrationRepository, cfg *config.Config, webhookSvc *WebhookService) domain.ErpIntegrationService {
	return &erpIntegrationService{
		repo:       repo,
		cfg:        cfg,
		webhookSvc: webhookSvc,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (s *erpIntegrationService) Create(ctx context.Context, i *domain.ErpIntegration) error {
	if i.AuthHeaderValue != "" {
		encryptedVal, err := crypto.Encrypt(i.AuthHeaderValue, s.cfg.AESEncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to encrypt auth header: %w", err)
		}
		i.AuthHeaderValue = encryptedVal
	}
	return s.repo.Create(ctx, i)
}

func (s *erpIntegrationService) Get(ctx context.Context, id int64, userID int64) (*domain.ErpIntegration, error) {
	i, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if i.AuthHeaderValue != "" {
		decryptedVal, err := crypto.Decrypt(i.AuthHeaderValue, s.cfg.AESEncryptionKey)
		if err != nil {
			return nil, errors.New("failed to decrypt auth header")
		}
		i.AuthHeaderValue = decryptedVal
	}
	return i, nil
}

func (s *erpIntegrationService) List(ctx context.Context, userID int64) ([]domain.ErpIntegration, error) {
	integrations, err := s.repo.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	// Redact secrets for UI listing
	for idx := range integrations {
		integrations[idx].AuthHeaderValue = ""
	}
	return integrations, nil
}

func (s *erpIntegrationService) ListAllInternal(ctx context.Context) ([]domain.ErpIntegration, error) {
	return s.repo.ListAllInternal(ctx)
}

func (s *erpIntegrationService) Update(ctx context.Context, i *domain.ErpIntegration) error {
	// If a new value is provided, encrypt it. Otherwise, keep the old encrypted value.
	// Typically, the frontend would send a dummy string like '••••••••' if unchanged.
	// For this simplicity, we check if it's not empty and not the masked placeholder.
	if i.AuthHeaderValue != "" && i.AuthHeaderValue != "••••••••" {
		encryptedVal, err := crypto.Encrypt(i.AuthHeaderValue, s.cfg.AESEncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to encrypt auth header: %w", err)
		}
		i.AuthHeaderValue = encryptedVal
	} else {
		// Fetch existing to retain the old encrypted value
		existing, err := s.repo.GetByID(ctx, i.ID, i.UserID)
		if err != nil {
			return err
		}
		i.AuthHeaderValue = existing.AuthHeaderValue
	}

	return s.repo.Update(ctx, i)
}

func (s *erpIntegrationService) Delete(ctx context.Context, id int64, userID int64) error {
	return s.repo.Delete(ctx, id, userID)
}

// ExecuteSyncJob is called by the Scheduler to fetch data from the ERP REST API
func (s *erpIntegrationService) ExecuteSyncJob(ctx context.Context, integrationID int64) error {
	// We need a superuser-like fetch here since it's triggered by the system,
	// but we fetch the specific integration via internal lookup to skip userID validation.
	log.Printf("[ERP Integrator] Running sync job for integration ID: %d", integrationID)

	i, err := s.repo.GetByID(ctx, integrationID, 0) // 0 implies system lookup if the repo supports it.
	// Let's rely on ListAllInternal and filter, or add GetInternal(id) to repo.
	if err != nil {
		// As fallback for system access (since our repo requires userID),
		// we will just pull all and filter.
		all, listErr := s.repo.ListAllInternal(ctx)
		if listErr != nil {
			return err
		}
		var found *domain.ErpIntegration
		for _, rec := range all {
			if rec.ID == integrationID {
				found = &rec
				break
			}
		}
		if found == nil {
			return fmt.Errorf("integration ID %d not found", integrationID)
		}
		i = found
	}

	// Decrypt header
	authVal := ""
	if i.AuthHeaderValue != "" {
		dec, err := crypto.Decrypt(i.AuthHeaderValue, s.cfg.AESEncryptionKey)
		if err == nil {
			authVal = dec
		}
	}

	req, err := http.NewRequestWithContext(ctx, i.Method, i.URL, nil) // Currently assumes GET or body-less POST
	if err != nil {
		return fmt.Errorf("failed to create http request: %w", err)
	}

	if i.AuthHeaderKey != "" && authVal != "" {
		req.Header.Set(i.AuthHeaderKey, authVal)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("erp returned non-success status code: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	// Parse it as WebhookPayload
	var payload domain.WebhookPayload
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		// Sometimes the ERP doesn't return exactly WebhookPayload.
		// For a robust system, we would need a JSON mapping layer (like we did for Database Connector).
		// But assuming the partner has agreed on the standard interface:
		log.Printf("[ERP Integrator] Warn: could not parse exact WebhookPayload. Error: %v", err)
		return err
	}

	if payload.BatchID == "" {
		payload.BatchID = fmt.Sprintf("ERP-SYNC-%d-%d", i.ID, time.Now().Unix())
	}

	// Forward to WebhookService for standard pipeline processing
	if _, svcErr := s.webhookSvc.ProcessWebhookPayload(ctx, int(i.UserID), payload); svcErr != nil {
		return fmt.Errorf("integration %s fetched data but pipeline rejected it: %w", i.Name, svcErr)
	}

	// Update LastSync At
	if err := s.repo.UpdateLastSyncTime(ctx, i.ID, time.Now()); err != nil {
		log.Printf("[ERP Integrator] failed recording sync time for %d: %v", i.ID, err)
	}

	return nil
}
