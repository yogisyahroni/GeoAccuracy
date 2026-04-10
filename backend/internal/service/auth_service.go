package service

import (
	"context"
	"errors"

	"strconv"

	"geoaccuracy-backend/config"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
	"geoaccuracy-backend/pkg/utils"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
)

type AuthService interface {
	Register(ctx context.Context, req domain.RegisterRequest) (*domain.AuthResponse, error)
	Login(ctx context.Context, req domain.LoginRequest) (*domain.AuthResponse, error)
	Refresh(ctx context.Context, refreshToken string) (*domain.AuthResponse, error)
}


type authService struct {
	userRepo repository.UserRepository
	cfg      *config.Config
}

func NewAuthService(userRepo repository.UserRepository, cfg *config.Config) AuthService {
	return &authService{userRepo: userRepo, cfg: cfg}
}

func (s *authService) Register(ctx context.Context, req domain.RegisterRequest) (*domain.AuthResponse, error) {
	// Hash password
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	// Create user
	user := &domain.User{
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: hashedPassword,
		Role:         "observer", // default role is now observer
	}

	if err := s.userRepo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	// Generate JWTs
	accessToken, err := utils.GenerateAccessToken(user.ID, user.Role, s.cfg)
	if err != nil {
		return nil, err
	}
	refreshToken, err := utils.GenerateRefreshToken(user.ID, s.cfg)
	if err != nil {
		return nil, err
	}

	return &domain.AuthResponse{
		User:         *user,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

func (s *authService) Login(ctx context.Context, req domain.LoginRequest) (*domain.AuthResponse, error) {
	// Find user
	user, err := s.userRepo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if err == repository.ErrUserNotFound {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	// Verify password
	isValid, err := utils.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !isValid {
		return nil, ErrInvalidCredentials
	}

	// Generate JWTs
	accessToken, err := utils.GenerateAccessToken(user.ID, user.Role, s.cfg)
	if err != nil {
		return nil, err
	}
	refreshToken, err := utils.GenerateRefreshToken(user.ID, s.cfg)
	if err != nil {
		return nil, err
	}

	return &domain.AuthResponse{
		User:         *user,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

func (s *authService) Refresh(ctx context.Context, refreshToken string) (*domain.AuthResponse, error) {
	// Parse the refresh token
	claims, err := utils.ParseToken(refreshToken, s.cfg)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}

	// In RefreshToken, we use Subject for UserID
	userIDStr := claims.Subject
	if userIDStr == "" {
		// Fallback for transition if we previously used claims.UserID
		if claims.UserID != 0 {
			userIDStr = strconv.FormatInt(claims.UserID, 10)
		} else {
			return nil, errors.New("invalid refresh token: missing subject")
		}
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		return nil, errors.New("invalid refresh token: corrupt payload")
	}

	// Load user to verify state and get current role
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errors.New("user not found or inactive")
	}

	// Generate new pair
	accessToken, err := utils.GenerateAccessToken(user.ID, user.Role, s.cfg)
	if err != nil {
		return nil, err
	}
	newRefreshToken, err := utils.GenerateRefreshToken(user.ID, s.cfg)
	if err != nil {
		return nil, err
	}

	return &domain.AuthResponse{
		User:         *user,
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
	}, nil
}


