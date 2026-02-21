package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
	"geoaccuracy-backend/pkg/crypto"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
)

type ColumnSchema struct {
	Name     string `json:"name"`
	DataType string `json:"data_type"`
}

type TableSchema struct {
	Name    string         `json:"name"`
	Columns []ColumnSchema `json:"columns"`
}

type DataSourceService interface {
	TestConnection(ds *domain.DataSource) error
	Create(ctx context.Context, ds *domain.DataSource) error
	GetSchema(ctx context.Context, id int64, userID int64) ([]TableSchema, error)
	List(ctx context.Context, userID int64) ([]domain.DataSource, error)

	SavePipeline(ctx context.Context, p *domain.TransformationPipeline) error
	GetPipeline(ctx context.Context, id int64, userID int64) (*domain.TransformationPipeline, error)
	ListPipelines(ctx context.Context, dsID int64, userID int64) ([]domain.TransformationPipeline, error)
	ListAllPipelines(ctx context.Context) ([]domain.TransformationPipeline, error)
	DeletePipeline(ctx context.Context, id int64, userID int64) error
}

type dataSourceService struct {
	repo repository.DataSourceRepository
	cfg  *config.Config
}

func NewDataSourceService(repo repository.DataSourceRepository, cfg *config.Config) DataSourceService {
	return &dataSourceService{repo: repo, cfg: cfg}
}

func (s *dataSourceService) buildDSN(ds *domain.DataSource) string {
	if ds.Provider == "postgresql" {
		return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
			ds.Host, ds.Port, ds.Username, ds.Password, ds.Database)
	} else if ds.Provider == "mysql" {
		return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s",
			ds.Username, ds.Password, ds.Host, ds.Port, ds.Database)
	}
	return ""
}

func (s *dataSourceService) TestConnection(ds *domain.DataSource) error {
	dsn := s.buildDSN(ds)
	if dsn == "" {
		return errors.New("unsupported provider")
	}

	driver := ds.Provider
	if driver == "postgresql" {
		driver = "postgres"
	}

	db, err := sql.Open(driver, dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	return db.Ping()
}

func (s *dataSourceService) Create(ctx context.Context, ds *domain.DataSource) error {
	// Encrypt the password before saving
	encryptedPassword, err := crypto.Encrypt(ds.Password, s.cfg.AESEncryptionKey)
	if err != nil {
		return err
	}
	ds.Password = encryptedPassword

	return s.repo.Create(ctx, ds)
}

func (s *dataSourceService) List(ctx context.Context, userID int64) ([]domain.DataSource, error) {
	sources, err := s.repo.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	// Do not return raw encrypted passwords
	for i := range sources {
		sources[i].Password = ""
	}
	return sources, nil
}

func (s *dataSourceService) SavePipeline(ctx context.Context, p *domain.TransformationPipeline) error {
	return s.repo.SavePipeline(ctx, p)
}

func (s *dataSourceService) GetPipeline(ctx context.Context, id int64, userID int64) (*domain.TransformationPipeline, error) {
	p, err := s.repo.GetPipelineByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errors.New("pipeline not found")
	}
	return p, nil
}

func (s *dataSourceService) ListPipelines(ctx context.Context, dsID int64, userID int64) ([]domain.TransformationPipeline, error) {
	return s.repo.ListPipelinesByDataSource(ctx, dsID, userID)
}

func (s *dataSourceService) ListAllPipelines(ctx context.Context) ([]domain.TransformationPipeline, error) {
	return s.repo.ListAllPipelines(ctx)
}

func (s *dataSourceService) DeletePipeline(ctx context.Context, id int64, userID int64) error {
	return s.repo.DeletePipeline(ctx, id, userID)
}

func (s *dataSourceService) GetSchema(ctx context.Context, id int64, userID int64) ([]TableSchema, error) {
	ds, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if ds == nil {
		return nil, errors.New("datasource not found")
	}

	decryptedPassword, err := crypto.Decrypt(ds.Password, s.cfg.AESEncryptionKey)
	if err != nil {
		return nil, errors.New("failed to decrypt credentials")
	}
	ds.Password = decryptedPassword

	dsn := s.buildDSN(ds)
	driver := ds.Provider
	if driver == "postgresql" {
		driver = "postgres"
	}

	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	if ds.Provider == "postgresql" || ds.Provider == "postgres" {
		return getPostgresSchema(ctx, db)
	} else if ds.Provider == "mysql" {
		return getMySQLSchema(ctx, db, ds.Database)
	}

	return nil, errors.New("schema extraction not implemented for provider")
}

func getPostgresSchema(ctx context.Context, db *sql.DB) ([]TableSchema, error) {
	query := `
		SELECT table_name, column_name, data_type 
		FROM information_schema.columns 
		WHERE table_schema = 'public'
		ORDER BY table_name, ordinal_position;
	`
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return mapRowsToSchema(rows)
}

func getMySQLSchema(ctx context.Context, db *sql.DB, dbName string) ([]TableSchema, error) {
	query := `
		SELECT table_name, column_name, data_type 
		FROM information_schema.columns 
		WHERE table_schema = ?
		ORDER BY table_name, ordinal_position;
	`
	rows, err := db.QueryContext(ctx, query, dbName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return mapRowsToSchema(rows)
}

func mapRowsToSchema(rows *sql.Rows) ([]TableSchema, error) {
	schemaMap := make(map[string]*TableSchema)
	var tableOrder []string

	for rows.Next() {
		var tableName, columnName, dataType string
		if err := rows.Scan(&tableName, &columnName, &dataType); err != nil {
			return nil, err
		}

		if _, exists := schemaMap[tableName]; !exists {
			schemaMap[tableName] = &TableSchema{Name: tableName, Columns: []ColumnSchema{}}
			tableOrder = append(tableOrder, tableName)
		}
		schemaMap[tableName].Columns = append(schemaMap[tableName].Columns, ColumnSchema{
			Name:     columnName,
			DataType: dataType,
		})
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	var result []TableSchema
	for _, tName := range tableOrder {
		result = append(result, *schemaMap[tName])
	}
	return result, nil
}
