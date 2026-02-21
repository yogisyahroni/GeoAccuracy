package service

import (
	"context"
	"errors"

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
		Role:         "user", // default role
	}

	if err := s.userRepo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	// Generate JWT
	token, err := utils.GenerateToken(user.ID, user.Role, s.cfg)
	if err != nil {
		return nil, err
	}

	return &domain.AuthResponse{
		User:        *user,
		AccessToken: token,
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

	// Generate JWT
	token, err := utils.GenerateToken(user.ID, user.Role, s.cfg)
	if err != nil {
		return nil, err
	}

	return &domain.AuthResponse{
		User:        *user,
		AccessToken: token,
	}, nil
}
