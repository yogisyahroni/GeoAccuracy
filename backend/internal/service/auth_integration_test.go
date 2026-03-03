package service_test

import (
	"context"
	"database/sql"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
	"geoaccuracy-backend/internal/service"
	"geoaccuracy-backend/pkg/utils"
)

// setupMockDB initializes a go-sqlmock database connection for testing.
func setupMockDB(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	return db, mock
}

func TestAuthAndIsolation_MockedIntegration(t *testing.T) {
	ctx := context.Background()
	db, sqlMock := setupMockDB(t)
	defer db.Close()

	// 1. Initialize DB Repositories
	userRepo := repository.NewUserRepository(db)
	historyRepo := repository.NewHistoryRepository(db)

	cfg := &config.Config{
		JWTSecret: "test-secret-integration",
	}
	authSvc := service.NewAuthService(userRepo, cfg)

	// --- 1. Test Registration (Argon2id hashing) ---
	reqTenantA := domain.RegisterRequest{
		Name:     "Tenant A",
		Email:    "tenant.a@test.com",
		Password: "SecurePassword123!",
	}

	// Expect database insert for user A
	sqlMock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, created_at, updated_at`)).
		WithArgs("Tenant A", "tenant.a@test.com", sqlmock.AnyArg(), "observer").
		WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(1, time.Now(), time.Now()))

	resA, err := authSvc.Register(ctx, reqTenantA)
	require.NoError(t, err)
	assert.NotEmpty(t, resA.AccessToken)
	assert.Equal(t, "observer", resA.User.Role)

	// --- 2. Test Login (JWT Creation & Argon2 Verification) ---
	loginReq := domain.LoginRequest{
		Email:    "tenant.a@test.com",
		Password: "SecurePassword123!",
	}

	// Capture the Argon2 Hash from previous registration step OR generate it manually.
	// Since Argon2 requires time to hash, we'll manually pre-hash 'SecurePassword123!' so Verify works
	hashedPw, _ := utils.HashPassword("SecurePassword123!")

	sqlMock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, created_at, updated_at FROM users WHERE email = LOWER($1)`)).
		WithArgs("tenant.a@test.com").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "created_at", "updated_at"}).
			AddRow(1, "Tenant A", "tenant.a@test.com", hashedPw, "observer", time.Now(), time.Now()))

	loginRes, err := authSvc.Login(ctx, loginReq)
	require.NoError(t, err)
	assert.NotEmpty(t, loginRes.AccessToken)
	assert.Equal(t, int64(1), loginRes.User.ID)

	// --- 3. Test DB Isolation (Tenant A) (RLS & Scoped queries) ---
	// Test cross-tenant safety through the explicit repository fetching

	// Expect GET Analytics query ensuring it specifically scopes WITH user_id = $1 (preventing data leaks)
	sqlMock.ExpectQuery(regexp.QuoteMeta(`
		SELECT 
			COUNT(*),
			COALESCE(SUM(total_count), 0),
			COALESCE(SUM(accurate_count), 0),
			COALESCE(SUM(fairly_count), 0),
			COALESCE(SUM(inaccurate_count), 0),
			COALESCE(SUM(error_count), 0)
		 FROM comparison_sessions 
		 WHERE user_id = $1`)).
		WithArgs(1). // Ensure user ID 1 is explicitly passed
		WillReturnRows(sqlmock.NewRows([]string{"count", "total_records", "total_accurate", "total_fairly", "total_inaccurate", "total_error"}).
			AddRow(1, 10, 8, 2, 0, 0))

	// Also it executes the last 10 trend sessions
	sqlMock.ExpectQuery(regexp.QuoteMeta(`SELECT id, user_id, total_count, accurate_count, fairly_count, inaccurate_count, error_count, created_at FROM comparison_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`)).
		WithArgs(1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "total_count", "accurate_count", "fairly_count", "inaccurate_count", "error_count", "created_at"}))

	historyA, err := historyRepo.GetAnalytics(int(resA.User.ID))
	require.NoError(t, err)
	assert.Equal(t, 10, historyA.TotalRecords, "Tenant A should correctly scope query isolation to see 10 searches")

	// Verify all expectations met
	err = sqlMock.ExpectationsWereMet()
	require.NoError(t, err, "All queries mapped to tenant-specific isolations must exist!")
}
