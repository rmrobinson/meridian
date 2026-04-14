package config

import (
	"errors"
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Server         Server         `mapstructure:"server"`
	Database       Database       `mapstructure:"database"`
	Auth           Auth           `mapstructure:"auth"`
	Person         Person         `mapstructure:"person"`
	LineFamilies   []LineFamily   `mapstructure:"line_families"`
	SourcePriority SourcePriority `mapstructure:"source_priority"`
	Enrichment     Enrichment     `mapstructure:"enrichment"`
}

type Enrichment struct {
	TMDBReadAccessToken string `mapstructure:"tmdb_read_access_token"`
	S3Bucket            string `mapstructure:"s3_bucket"`
	S3Region            string `mapstructure:"s3_region"`
}

type Server struct {
	RESTPort           int      `mapstructure:"rest_port"`
	GRPCPort           int      `mapstructure:"grpc_port"`
	ShutdownTimeoutSec int      `mapstructure:"shutdown_timeout_sec"`
	CORSAllowedOrigins []string `mapstructure:"cors_allowed_origins"`
}

type Database struct {
	Path string `mapstructure:"path"`
}

type Auth struct {
	JWTSecret   string       `mapstructure:"jwt_secret"`
	WriteTokens []WriteToken `mapstructure:"write_tokens"`
}

type WriteToken struct {
	Name      string `mapstructure:"name"`
	TokenHash string `mapstructure:"token_hash"`
}

type Person struct {
	Name      string `mapstructure:"name"`
	BirthDate string `mapstructure:"birth_date"`
}

type LineFamily struct {
	ID             string `mapstructure:"id"`
	Label          string `mapstructure:"label"`
	BaseColorHSL   []int  `mapstructure:"base_color_hsl"`
	Side           string `mapstructure:"side"`
	OnEnd          string `mapstructure:"on_end"`
	SpawnBehavior  string `mapstructure:"spawn_behavior"`
	ParentFamilyID string `mapstructure:"parent_family_id"`
}

type SourcePriority struct {
	Sources []string `mapstructure:"sources"`
}

// Load reads the config file at the given path and returns a validated Config.
func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("reading config: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}

	if err := validate(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func validate(cfg *Config) error {
	var errs []error

	if cfg.Auth.JWTSecret == "" {
		errs = append(errs, errors.New("auth.jwt_secret is required"))
	}
	if cfg.Database.Path == "" {
		errs = append(errs, errors.New("database.path is required"))
	}
	if cfg.Person.BirthDate == "" {
		errs = append(errs, errors.New("person.birth_date is required"))
	}
	if len(cfg.Auth.WriteTokens) == 0 {
		errs = append(errs, errors.New("auth.write_tokens must not be empty"))
	}

	return errors.Join(errs...)
}
