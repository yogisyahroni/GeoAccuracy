package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DataSourceHandler struct {
	dsService    service.DataSourceService
	etlService   service.ETLService
	compService  service.ComparisonService
	schedService service.SchedulerService
	batchService domain.BatchService // persists ETL results to batch_items for Dashboard visibility
}

func NewDataSourceHandler(
	ds service.DataSourceService,
	etl service.ETLService,
	comp service.ComparisonService,
	sched service.SchedulerService,
	batch domain.BatchService,
) *DataSourceHandler {
	return &DataSourceHandler{
		dsService:    ds,
		etlService:   etl,
		compService:  comp,
		schedService: sched,
		batchService: batch,
	}
}

// Create handles creating a new saved connection
func (h *DataSourceHandler) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var req domain.DataSource
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.UserID = int64(userID)

	if err := h.dsService.Create(c.Request.Context(), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create data source", "details": err.Error()})
		return
	}

	// Mask password before returning
	req.Password = ""
	c.JSON(http.StatusCreated, req)
}

// TestConnection handles testing credentials without saving
func (h *DataSourceHandler) TestConnection(c *gin.Context) {
	var ds domain.DataSource
	if err := c.ShouldBindJSON(&ds); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.dsService.TestConnection(&ds); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Connection failed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Connection successful"})
}

// List handles listing the user's data sources
func (h *DataSourceHandler) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	sources, err := h.dsService.List(c.Request.Context(), int64(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch data sources"})
		return
	}

	c.JSON(http.StatusOK, sources)
}

// GetSchema handles extracting the tables and columns for a given connection
func (h *DataSourceHandler) GetSchema(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid data source ID"})
		return
	}

	schema, err := h.dsService.GetSchema(c.Request.Context(), id, int64(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch schema", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schema)
}

// PreviewPipeline executes the dynamically built SQL mapped query to show exactly what data comes out
func (h *DataSourceHandler) PreviewPipeline(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var pipeline domain.TransformationPipeline
	if err := c.ShouldBindJSON(&pipeline); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pipeline.UserID = int64(userID)

	results, err := h.etlService.PreviewData(c.Request.Context(), &pipeline)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Pipeline execution failed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": results})
}

// RunPipeline executes the ETL pipeline and:
// 1. Streams results back to the HTTP client in real-time (chunked JSON)
// 2. Creates a Batch entry so results appear in the Dashboard alongside CSV uploads
func (h *DataSourceHandler) RunPipeline(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var pipeline domain.TransformationPipeline
	if err := c.ShouldBindJSON(&pipeline); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pipeline.UserID = int64(userID)

	ctx := c.Request.Context()

	// --- Create a Batch entry so results persist in the Dashboard ---
	batchName := fmt.Sprintf("ETL: %s (%s)", pipeline.Name, time.Now().Format("02 Jan 2006 15:04"))
	var batchID uuid.UUID
	var etlItems []domain.BatchItem

	if h.batchService != nil {
		batch, err := h.batchService.CreateBatch(ctx, int64(userID), batchName)
		if err != nil {
			log.Printf("WARN: could not create batch for ETL pipeline %d: %v", pipeline.ID, err)
		} else {
			batchID = batch.ID
		}
	}

	session := &domain.ComparisonSession{UserID: userID}

	// Set headers for chunked streaming
	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write([]byte(`{"results":[`))
	c.Writer.Flush()

	first := true
	err := h.etlService.ExecutePipelineStream(ctx, &pipeline, 1000, func(batch []domain.ValidationRequestItem) error {
		for _, item := range batch {
			res := h.compService.ValidateSingle(ctx, userID, item)

			// Update session stats
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

			// Accumulate into ETL batch for Dashboard persistence
			if batchID != uuid.Nil {
				// Determine geocode_status: if there's an error, mark as "failed", else "completed"
				geoStatus := "completed"
				if res.Error != "" {
					geoStatus = "failed"
				}
				bi := domain.BatchItem{
					ID:            uuid.New(),
					BatchID:       batchID,
					Connote:       item.ID,
					SystemAddress: item.SystemAddress,
					GeocodeStatus: geoStatus,
					AccuracyLevel: res.AccuracyLevel,
					Error:         res.Error,
				}
				if res.GeoLat != 0 {
					lat, lng := res.GeoLat, res.GeoLng
					bi.SystemLat = &lat
					bi.SystemLng = &lng
				}
				if item.FieldLat != 0 {
					fLat, fLng := item.FieldLat, item.FieldLng
					bi.FieldLat = &fLat
					bi.FieldLng = &fLng
				}
				if res.DistanceKm != 0 {
					dist := res.DistanceKm
					bi.DistanceKm = &dist
				}
				etlItems = append(etlItems, bi)
			}

			// Write JSON chunk to stream
			jsonBytes, err := json.Marshal(res)
			if err != nil {
				continue
			}
			if !first {
				c.Writer.Write([]byte(`,`))
			}
			c.Writer.Write(jsonBytes)
			first = false
		}
		c.Writer.Flush()
		return nil
	})

	if err != nil {
		log.Printf("ERROR streaming pipeline: %v", err)
		errJSON, _ := json.Marshal(gin.H{"pipeline_error": err.Error()})
		if !first {
			c.Writer.Write([]byte(`,`))
		}
		c.Writer.Write(errJSON)
	}

	c.Writer.Write([]byte(`]}`))
	c.Writer.Flush()

	// --- Persist ETL results to batch_items (for Dashboard) in background ---
	if batchID != uuid.Nil && len(etlItems) > 0 {
		go func() {
			// Background context since HTTP is already done
			bgCtx := context.Background()
			if err := h.batchService.UpsertETLItems(bgCtx, batchID, etlItems); err != nil {
				log.Printf("WARN: failed to persist ETL batch items for batch %v: %v", batchID, err)
				return
			}
			if err := h.batchService.MarkBatchCompleted(bgCtx, batchID); err != nil {
				log.Printf("WARN: failed to mark ETL batch %v as completed: %v", batchID, err)
			}
		}()
	}

	// --- Persist comparison session (History) ---
	if session.TotalCount > 0 {
		go func() {
			saveErr := h.compService.SaveSession(session)
			if saveErr != nil {
				log.Printf("WARN: failed to save streamed comparison session: %v", saveErr)
			}
		}()
	}
}

// SavePipeline validates and saves pipeline configurations
func (h *DataSourceHandler) SavePipeline(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var pipeline domain.TransformationPipeline
	if err := c.ShouldBindJSON(&pipeline); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pipeline.UserID = int64(userID)

	if err := h.dsService.SavePipeline(c.Request.Context(), &pipeline); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save pipeline", "details": err.Error()})
		return
	}

	// Update the scheduler with the new configuration
	if err := h.schedService.AddOrUpdateJob(c.Request.Context(), pipeline); err != nil {
		log.Printf("Warning: failed to schedule pipeline %d: %v", pipeline.ID, err)
	}

	c.JSON(http.StatusOK, pipeline)
}

// ListPipelines retrieves saved pipelines for a specific data source
func (h *DataSourceHandler) ListPipelines(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	dsID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid datasource ID"})
		return
	}

	pipelines, err := h.dsService.ListPipelines(c.Request.Context(), dsID, int64(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list pipelines", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pipelines)
}

// DeletePipeline removes a saved pipeline
func (h *DataSourceHandler) DeletePipeline(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pipeline ID"})
		return
	}

	if err := h.dsService.DeletePipeline(c.Request.Context(), id, int64(userID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete pipeline", "details": err.Error()})
		return
	}

	// Remove from scheduler if it was active
	h.schedService.RemoveJob(id)

	c.JSON(http.StatusOK, gin.H{"message": "Pipeline deleted"})
}
