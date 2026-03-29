package rest

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"

	"github.com/rmrobinson/meridian/backend/internal/domain"
)

// Claims holds the parsed JWT claims used by the REST read path.
type Claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

// ValidateToken parses and validates a JWT string, returning the claims on success.
func ValidateToken(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}
	return claims, nil
}

// RoleToVisibility maps a JWT role string to the set of visibility levels the
// caller is permitted to see.
func RoleToVisibility(role string) []domain.Visibility {
	switch role {
	case "owner":
		return []domain.Visibility{
			domain.VisibilityPublic,
			domain.VisibilityFriends,
			domain.VisibilityFamily,
			domain.VisibilityPersonal,
		}
	case "family":
		return []domain.Visibility{
			domain.VisibilityPublic,
			domain.VisibilityFriends,
			domain.VisibilityFamily,
		}
	case "friends":
		return []domain.Visibility{
			domain.VisibilityPublic,
			domain.VisibilityFriends,
		}
	default:
		return []domain.Visibility{domain.VisibilityPublic}
	}
}
