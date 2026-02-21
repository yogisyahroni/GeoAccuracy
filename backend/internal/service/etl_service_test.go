package service_test

import (
	"strings"
	"testing"

	"geoaccuracy-backend/internal/service"

	"github.com/stretchr/testify/assert"
)

func TestETLService_BuildSQL(t *testing.T) {
	svc := service.NewETLService(nil, nil)

	t.Run("Basic Selection with Base Table", func(t *testing.T) {
		cfg := &service.PipelineConfig{
			BaseTable: "users",
			Mappings: []service.ColumnMapping{
				{TargetColumn: "id", Expression: "users.id"},
				{TargetColumn: "full_address", Expression: "CONCAT(users.address, ', ', users.city)"},
			},
		}

		query, err := svc.BuildSQL(cfg, "postgres")
		assert.NoError(t, err)

		expected := "SELECT \n    users.id AS id,\n    CONCAT(users.address, ', ', users.city) AS full_address \nFROM users"
		assert.Equal(t, strings.TrimSpace(expected), strings.TrimSpace(query))
	})

	t.Run("With Inner Join and Limit", func(t *testing.T) {
		cfg := &service.PipelineConfig{
			BaseTable: "orders",
			Joins: []service.JoinConfig{
				{
					Type:     "INNER",
					Table:    "users",
					OnSource: "orders.user_id",
					OnTarget: "users.id",
				},
				{
					Type:     "LEFT",
					Table:    "locations",
					OnSource: "users.location_id",
					OnTarget: "locations.id",
				},
			},
			Mappings: []service.ColumnMapping{
				{TargetColumn: "order_id", Expression: "orders.id"},
				{TargetColumn: "user_name", Expression: "users.name"},
				{TargetColumn: "lat", Expression: "locations.latitude"},
			},
			Limit: 50,
		}

		query, err := svc.BuildSQL(cfg, "postgres")
		assert.NoError(t, err)

		expected := `SELECT 
    orders.id AS order_id,
    users.name AS user_name,
    locations.latitude AS lat 
FROM orders
INNER JOIN users ON orders.user_id = users.id
LEFT JOIN locations ON users.location_id = locations.id
LIMIT 50`
		assert.Equal(t, expected, query)
	})

	t.Run("Missing Base Table", func(t *testing.T) {
		cfg := &service.PipelineConfig{
			BaseTable: "",
			Mappings: []service.ColumnMapping{
				{TargetColumn: "id", Expression: "id"},
			},
		}
		_, err := svc.BuildSQL(cfg, "postgres")
		assert.ErrorContains(t, err, "base_table is required")
	})

	t.Run("Missing Mappings", func(t *testing.T) {
		cfg := &service.PipelineConfig{
			BaseTable: "users",
			Mappings:  []service.ColumnMapping{},
		}
		_, err := svc.BuildSQL(cfg, "postgres")
		assert.ErrorContains(t, err, "at least one column mapping is required")
	})
}
