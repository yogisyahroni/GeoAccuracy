package utils

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters — use distinct constant names to avoid shadowing "time" package
const (
	argonFormat  = "$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s"
	argonTime    = uint32(3)
	argonMemory  = uint32(65536)
	argonThreads = uint8(4)
	argonKeyLen  = uint32(32)
	argonSaltLen = 16
)

// HashPassword hashes a plaintext password using Argon2id and returns an encoded string.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encodedHash := fmt.Sprintf(argonFormat, argon2.Version, argonMemory, argonTime, argonThreads, b64Salt, b64Hash)

	return encodedHash, nil
}

// VerifyPassword checks a plaintext password against an Argon2id encoded hash.
func VerifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false, errors.New("invalid hash format: expected 6 segments")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, fmt.Errorf("parse version: %w", err)
	}
	if version != argon2.Version {
		return false, errors.New("incompatible argon2id version")
	}

	var mem, t, pThreads uint32
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &t, &pThreads); err != nil {
		return false, fmt.Errorf("parse parameters: %w", err)
	}

	// argon2.IDKey requires threads as uint8
	if pThreads > 255 {
		return false, errors.New("threads parameter exceeds uint8 range")
	}
	threads := uint8(pThreads) //nolint:gosec // range checked above

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("decode salt: %w", err)
	}

	decodedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("decode hash: %w", err)
	}
	hashLen := uint32(len(decodedHash))

	hashToVerify := argon2.IDKey([]byte(password), salt, t, mem, threads, hashLen)

	if subtle.ConstantTimeCompare(decodedHash, hashToVerify) == 1 {
		return true, nil
	}
	return false, nil
}
