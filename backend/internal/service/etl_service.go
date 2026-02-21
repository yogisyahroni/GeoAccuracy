package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
	"geoaccuracy-backend/pkg/crypto"
)

// PipelineConfig defines the structure for the JSON stored in TransformationPipeline.Config
type PipelineConfig struct {
	BaseTable string          `json:"base_table"`
	Joins     []JoinConfig    `json:"joins"`
	Mappings  []ColumnMapping `json:"mappings"`
	Filters   []FilterConfig  `json:"filters,omitempty"`
	Limit     int             `json:"limit,omitempty"`
}

type FilterConfig struct {
	Column   string `json:"column"`
	Operator string `json:"operator"` // "=", ">", "<", "LIKE"
	Value    string `json:"value"`
}

type JoinConfig struct {
	Type     string `json:"type"` // "LEFT", "INNER", etc.
	Table    string `json:"table"`
	OnSource string `json:"on_source"` // e.g., "base_table.user_id"
	OnTarget string `json:"on_target"` // e.g., "join_table.id"
}

type ColumnMapping struct {
	TargetColumn string `json:"target_column"` // "id", "full_address", "latitude", "longitude"
	Expression   string `json:"expression"`    // "CONCAT(t1.address1, ' ', t1.address2)" or just "t1.lat"
}

type ETLService interface {
	BuildSQL(config *PipelineConfig, provider string) (string, error)
	PreviewData(ctx context.Context, pipeline *domain.TransformationPipeline) ([]map[string]interface{}, error)
	ExecutePipeline(ctx context.Context, pipeline *domain.TransformationPipeline) ([]domain.ValidationRequestItem, error)
	ExecutePipelineStream(ctx context.Context, pipeline *domain.TransformationPipeline, batchSize int, processBatch func([]domain.ValidationRequestItem) error) error
}

type etlService struct {
	dsRepo repository.DataSourceRepository
	cfg    *config.Config
}

func NewETLService(dsRepo repository.DataSourceRepository, cfg *config.Config) ETLService {
	return &etlService{dsRepo: dsRepo, cfg: cfg}
}

// Define our regex for valid SQL identifiers (tables, columns)
var validIdentifierRegex = regexp.MustCompile(`^[a-zA-Z0-9_.]+$`)

func sanitizeIdentifier(ident string) error {
	if !validIdentifierRegex.MatchString(ident) {
		return fmt.Errorf("invalid identifier, potential sql injection detected: %s", ident)
	}
	return nil
}

func sanitizeExpression(expr string) error {
	if strings.Contains(expr, ";") || strings.Contains(expr, "--") || strings.Contains(expr, "/*") {
		return errors.New("forbidden sql characters in expression")
	}
	upper := strings.ToUpper(expr)
	forbiddenKeywords := []string{"SELECT ", "INSERT ", "UPDATE ", "DELETE ", "DROP ", "ALTER ", "CREATE ", "TRUNCATE", "EXEC", "UNION", "INTO", "MERGE", "EXECUTE"}
	for _, kw := range forbiddenKeywords {
		if strings.Contains(upper, kw) {
			return fmt.Errorf("forbidden keyword %s in expression", kw)
		}
	}
	return nil
}

// BuildSQL takes the UI mapping configuration and generates a raw optimized SQL query.
func (s *etlService) BuildSQL(config *PipelineConfig, provider string) (string, error) {
	if config.BaseTable == "" {
		return "", errors.New("base_table is required")
	}
	if err := sanitizeIdentifier(config.BaseTable); err != nil {
		return "", err
	}
	if len(config.Mappings) == 0 {
		return "", errors.New("at least one column mapping is required")
	}

	// 1. Build SELECT clause
	var selects []string
	for _, mapping := range config.Mappings {
		if err := sanitizeIdentifier(mapping.TargetColumn); err != nil {
			return "", err
		}
		if err := sanitizeExpression(mapping.Expression); err != nil {
			return "", err
		}
		selects = append(selects, fmt.Sprintf("%s AS %s", mapping.Expression, mapping.TargetColumn))
	}
	selectStr := strings.Join(selects, ",\n    ")

	// 2. Build FROM clause
	fromStr := config.BaseTable

	// 3. Build JOIN clauses
	var joinStrs []string
	for _, j := range config.Joins {
		if err := sanitizeIdentifier(j.Table); err != nil {
			return "", err
		}
		if err := sanitizeIdentifier(j.OnSource); err != nil {
			return "", err
		}
		if err := sanitizeIdentifier(j.OnTarget); err != nil {
			return "", err
		}

		joinType := "LEFT JOIN" // Default
		if strings.ToUpper(j.Type) == "INNER" {
			joinType = "INNER JOIN"
		}
		joinStrs = append(joinStrs, fmt.Sprintf("%s %s ON %s = %s", joinType, j.Table, j.OnSource, j.OnTarget))
	}
	joinsStr := strings.Join(joinStrs, "\n")

	// 4. Build WHERE clause
	var whereStrs []string
	for _, f := range config.Filters {
		if err := sanitizeIdentifier(f.Column); err != nil {
			return "", err
		}

		op := strings.ToUpper(strings.TrimSpace(f.Operator))
		validOps := map[string]bool{"=": true, ">": true, "<": true, ">=": true, "<=": true, "!=": true, "LIKE": true, "ILIKE": true}
		if !validOps[op] {
			return "", fmt.Errorf("invalid where operator: %s", op)
		}

		// Basic sanitization by escaping single quotes
		val := strings.ReplaceAll(f.Value, "'", "''")
		if err := sanitizeExpression(val); err != nil {
			return "", err
		}
		whereStrs = append(whereStrs, fmt.Sprintf("%s %s '%s'", f.Column, op, val))
	}
	whereStr := ""
	if len(whereStrs) > 0 {
		whereStr = "WHERE " + strings.Join(whereStrs, " AND ")
	}

	// Assemble Output
	query := fmt.Sprintf("SELECT \n    %s \nFROM %s", selectStr, fromStr)
	if joinsStr != "" {
		query += "\n" + joinsStr
	}
	if whereStr != "" {
		query += "\n" + whereStr
	}

	if config.Limit > 0 {
		query += fmt.Sprintf("\nLIMIT %d", config.Limit)
	}

	return query, nil
}

// buildDSN is copied from dataSourceService logic for now to resolve db opening
func (s *etlService) buildDSN(ds *domain.DataSource) string {
	if ds.Provider == "postgresql" || ds.Provider == "postgres" {
		return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
			ds.Host, ds.Port, ds.Username, ds.Password, ds.Database)
	} else if ds.Provider == "mysql" {
		return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s",
			ds.Username, ds.Password, ds.Host, ds.Port, ds.Database)
	}
	return ""
}

// PreviewData tests the pipeline configuration against the target database and returns a small set of mapped records.
func (s *etlService) PreviewData(ctx context.Context, pipeline *domain.TransformationPipeline) ([]map[string]interface{}, error) {
	var pConfig PipelineConfig
	if err := json.Unmarshal(pipeline.Config, &pConfig); err != nil {
		return nil, fmt.Errorf("invalid pipeline config json: %w", err)
	}

	// Force limit for preview
	pConfig.Limit = 10

	ds, err := s.dsRepo.GetByID(ctx, pipeline.DataSourceID, pipeline.UserID)
	if err != nil || ds == nil {
		return nil, errors.New("datasource not found or unauthorized")
	}

	// Decrypt password
	decryptedPassword, err := crypto.Decrypt(ds.Password, s.cfg.AESEncryptionKey)
	if err != nil {
		return nil, errors.New("failed to decrypt source credentials")
	}
	ds.Password = decryptedPassword

	// Build the SQL Pushdown query
	sqlQuery, err := s.BuildSQL(&pConfig, ds.Provider)
	if err != nil {
		return nil, fmt.Errorf("failed to build SQL: %w", err)
	}

	// Open Connection
	driver := ds.Provider
	if driver == "postgresql" {
		driver = "postgres"
	}

	db, err := sql.Open(driver, s.buildDSN(ds))
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// Execute Transform natively on the database Engine
	rows, err := db.QueryContext(ctx, sqlQuery)
	if err != nil {
		return nil, fmt.Errorf("transform execution failed: %w", err)
	}
	defer rows.Close()

	// Parse generic rows
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}

	for rows.Next() {
		columnsData := make([]interface{}, len(columns))
		columnPointers := make([]interface{}, len(columns))
		for i := range columnsData {
			columnPointers[i] = &columnsData[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return nil, err
		}

		rowData := make(map[string]interface{})
		for i, colName := range columns {
			val := columnPointers[i].(*interface{})
			// Convert []byte to string for generic JSON formatting if necessary
			if b, ok := (*val).([]byte); ok {
				rowData[colName] = string(b)
			} else {
				rowData[colName] = *val
			}
		}
		results = append(results, rowData)
	}

	return results, nil
}

// ExecutePipeline fully runs the ETL extraction and maps strictly into ValidationRequestItems
func (s *etlService) ExecutePipeline(ctx context.Context, pipeline *domain.TransformationPipeline) ([]domain.ValidationRequestItem, error) {
	var pConfig PipelineConfig
	if err := json.Unmarshal(pipeline.Config, &pConfig); err != nil {
		return nil, fmt.Errorf("invalid pipeline config json: %w", err)
	}

	ds, err := s.dsRepo.GetByID(ctx, pipeline.DataSourceID, pipeline.UserID)
	if err != nil || ds == nil {
		return nil, errors.New("datasource not found or unauthorized")
	}

	decryptedPassword, err := crypto.Decrypt(ds.Password, s.cfg.AESEncryptionKey)
	if err != nil {
		return nil, errors.New("failed to decrypt source credentials")
	}
	ds.Password = decryptedPassword

	sqlQuery, err := s.BuildSQL(&pConfig, ds.Provider)
	if err != nil {
		return nil, fmt.Errorf("failed to build SQL: %w", err)
	}

	driver := ds.Provider
	if driver == "postgresql" {
		driver = "postgres"
	}

	db, err := sql.Open(driver, s.buildDSN(ds))
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx, sqlQuery)
	if err != nil {
		return nil, fmt.Errorf("transform execution failed: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	// Map column names to their index
	colMap := make(map[string]int)
	for i, col := range columns {
		colMap[col] = i
	}

	var items []domain.ValidationRequestItem

	for rows.Next() {
		// Scan everything into interface{}
		columnsData := make([]interface{}, len(columns))
		columnPointers := make([]interface{}, len(columns))
		for i := range columnsData {
			columnPointers[i] = &columnsData[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return nil, err
		}

		// Helper to safely extract string
		getString := func(col string) string {
			idx, ok := colMap[col]
			if !ok {
				return ""
			}
			val := columnPointers[idx].(*interface{})
			if val == nil || *val == nil {
				return ""
			}
			if b, ok := (*val).([]byte); ok {
				return string(b)
			}
			return fmt.Sprintf("%v", *val)
		}

		// Helper to safely extract float64
		getFloat := func(col string) float64 {
			idx, ok := colMap[col]
			if !ok {
				return 0.0
			}
			val := columnPointers[idx].(*interface{})
			if val == nil || *val == nil {
				return 0.0
			}

			// Handle various numeric return types from drivers
			switch v := (*val).(type) {
			case float64:
				return v
			case float32:
				return float64(v)
			case int64:
				return float64(v)
			case int32:
				return float64(v)
			case int:
				return float64(v)
			case []byte:
				var f float64
				fmt.Sscanf(string(v), "%f", &f)
				return f
			case string:
				var f float64
				fmt.Sscanf(v, "%f", &f)
				return f
			default:
				return 0.0
			}
		}

		item := domain.ValidationRequestItem{
			ID:            getString("id"),
			SystemAddress: getString("full_address"),
			FieldLat:      getFloat("latitude"),
			FieldLng:      getFloat("longitude"),
		}

		items = append(items, item)
	}

	return items, nil
}

// ExecutePipelineStream runs the ETL extraction and streams the results in chunks to prevent OOM
func (s *etlService) ExecutePipelineStream(ctx context.Context, pipeline *domain.TransformationPipeline, batchSize int, processBatch func([]domain.ValidationRequestItem) error) error {
	var pConfig PipelineConfig
	if err := json.Unmarshal(pipeline.Config, &pConfig); err != nil {
		return fmt.Errorf("invalid pipeline config json: %w", err)
	}

	ds, err := s.dsRepo.GetByID(ctx, pipeline.DataSourceID, pipeline.UserID)
	if err != nil || ds == nil {
		return errors.New("datasource not found or unauthorized")
	}

	decryptedPassword, err := crypto.Decrypt(ds.Password, s.cfg.AESEncryptionKey)
	if err != nil {
		return errors.New("failed to decrypt source credentials")
	}
	ds.Password = decryptedPassword

	sqlQuery, err := s.BuildSQL(&pConfig, ds.Provider)
	if err != nil {
		return fmt.Errorf("failed to build SQL: %w", err)
	}

	driver := ds.Provider
	if driver == "postgresql" {
		driver = "postgres"
	}

	db, err := sql.Open(driver, s.buildDSN(ds))
	if err != nil {
		return err
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx, sqlQuery)
	if err != nil {
		return fmt.Errorf("transform execution failed: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return err
	}

	colMap := make(map[string]int)
	for i, col := range columns {
		colMap[col] = i
	}

	var batch []domain.ValidationRequestItem

	for rows.Next() {
		columnsData := make([]interface{}, len(columns))
		columnPointers := make([]interface{}, len(columns))
		for i := range columnsData {
			columnPointers[i] = &columnsData[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return err
		}

		getString := func(col string) string {
			idx, ok := colMap[col]
			if !ok {
				return ""
			}
			val := columnPointers[idx].(*interface{})
			if val == nil || *val == nil {
				return ""
			}
			if b, ok := (*val).([]byte); ok {
				return string(b)
			}
			return fmt.Sprintf("%v", *val)
		}

		getFloat := func(col string) float64 {
			idx, ok := colMap[col]
			if !ok {
				return 0.0
			}
			val := columnPointers[idx].(*interface{})
			if val == nil || *val == nil {
				return 0.0
			}
			switch v := (*val).(type) {
			case float64:
				return v
			case float32:
				return float64(v)
			case int64:
				return float64(v)
			case int32:
				return float64(v)
			case int:
				return float64(v)
			case []byte:
				var f float64
				fmt.Sscanf(string(v), "%f", &f)
				return f
			case string:
				var f float64
				fmt.Sscanf(v, "%f", &f)
				return f
			default:
				return 0.0
			}
		}

		item := domain.ValidationRequestItem{
			ID:            getString("id"),
			SystemAddress: getString("full_address"),
			FieldLat:      getFloat("latitude"),
			FieldLng:      getFloat("longitude"),
		}

		batch = append(batch, item)
		if len(batch) >= batchSize {
			if err := processBatch(batch); err != nil {
				return err
			}
			batch = batch[:0]
		}
	}

	if len(batch) > 0 {
		if err := processBatch(batch); err != nil {
			return err
		}
	}

	return nil
}
