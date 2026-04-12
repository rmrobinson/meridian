package sharing

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// Claims holds the parsed JWT claims for a sharing token.
type Claims struct {
	jwt.RegisteredClaims                // ID field = jti (matches sharing_tokens.id)
	Name             string `json:"name"`
	Email            string `json:"email"`
	Visibility       int32  `json:"visibility"` // meridian.v1.Visibility wire value
}

// Issue signs a JWT for t using HMAC-HS256. t.ID must already be set and the
// DB row must already exist before Issue is called.
func Issue(t *SharingToken, secret []byte) (string, error) {
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ID:       t.ID,
			IssuedAt: jwt.NewNumericDate(t.CreatedAt),
		},
		Name:       t.Name,
		Email:      t.Email,
		Visibility: domainVisibilityToInt(t.Visibility),
	}
	if t.ExpiresAt != nil {
		claims.ExpiresAt = jwt.NewNumericDate(*t.ExpiresAt)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("signing sharing token JWT: %w", err)
	}
	return signed, nil
}

// Validate verifies the JWT signature and returns the parsed claims. Claims
// validation (exp, nbf) is intentionally skipped — the DB row is authoritative
// for revocation and expiry. The caller must validate those after lookup.
func Validate(tokenStr string, secret []byte) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		tokenStr,
		&Claims{},
		func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return secret, nil
		},
		jwt.WithoutClaimsValidation(),
	)
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}
	return claims, nil
}

// domainVisibilityToInt maps a domain Visibility string to the proto
// meridian.v1.Visibility wire integer stored in the JWT.
func domainVisibilityToInt(v domain.Visibility) int32 {
	switch v {
	case domain.VisibilityPublic:
		return 1
	case domain.VisibilityFriends:
		return 2
	case domain.VisibilityFamily:
		return 3
	case domain.VisibilityPersonal:
		return 4
	default:
		return 0
	}
}
