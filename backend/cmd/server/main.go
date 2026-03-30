package main

import (
	"context"
	"flag"
	"net"
	"net/http"
	"os"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/zap"

	grpcapi "github.com/rmrobinson/meridian/backend/internal/api/grpc"
	"github.com/rmrobinson/meridian/backend/internal/api/rest"
	"github.com/rmrobinson/meridian/backend/internal/config"
	"github.com/rmrobinson/meridian/backend/internal/db"
	"github.com/rmrobinson/meridian/backend/internal/domain"
	"github.com/rmrobinson/meridian/backend/internal/enrichment"
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to config file")
	flag.Parse()

	logger, err := zap.NewProduction()
	if err != nil {
		panic(err)
	}
	defer logger.Sync()

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Fatal("failed to load config", zap.Error(err))
	}

	logger.Info("config loaded",
		zap.Int("rest_port", cfg.Server.RESTPort),
		zap.Int("grpc_port", cfg.Server.GRPCPort),
		zap.String("database", cfg.Database.Path),
		zap.String("person", cfg.Person.Name),
		zap.String("birth_date", cfg.Person.BirthDate),
	)

	logger.Info("line families loaded", zap.Int("count", len(cfg.LineFamilies)))
	for _, f := range cfg.LineFamilies {
		logger.Info("family",
			zap.String("id", f.ID),
			zap.String("label", f.Label),
			zap.String("side", f.Side),
			zap.String("on_end", f.OnEnd),
			zap.String("spawn_behavior", f.SpawnBehavior),
		)
	}

	logger.Info("source priority loaded", zap.Strings("sources", cfg.SourcePriority.Sources))

	tokenNames := make([]string, len(cfg.Auth.WriteTokens))
	for i, t := range cfg.Auth.WriteTokens {
		tokenNames[i] = t.Name
	}
	logger.Info("write tokens configured", zap.Strings("names", tokenNames))

	database, err := db.Open(cfg.Database.Path)
	if err != nil {
		logger.Fatal("failed to open database", zap.Error(err))
	}
	defer database.Close()

	logger.Info("database ready", zap.String("path", cfg.Database.Path))

	// Build enrichers when API keys are configured; nil disables enrichment.
	bookEnricher, filmTVEnricher := buildEnrichers(cfg, logger)

	// Start gRPC server in background.
	grpcServer := grpcapi.NewGRPCServer(cfg, database, logger, bookEnricher, filmTVEnricher)
	grpcAddr := grpcapi.Addr(cfg)
	lis, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		logger.Fatal("failed to listen for gRPC", zap.String("addr", grpcAddr), zap.Error(err))
	}
	go func() {
		logger.Info("starting gRPC server", zap.String("addr", grpcAddr))
		if err := grpcServer.Serve(lis); err != nil {
			logger.Fatal("gRPC server failed", zap.Error(err))
		}
	}()

	// Start REST server (blocks).
	restServer := rest.NewServer(cfg, database, logger)
	restAddr := restServer.Addr()
	logger.Info("starting REST server", zap.String("addr", restAddr))
	if err := http.ListenAndServe(restAddr, restServer); err != nil {
		logger.Fatal("REST server failed", zap.Error(err))
		os.Exit(1)
	}
}

// buildEnrichers constructs ISBNdb and TMDB enrichers when API keys are present.
// Returns nil for either enricher if its API key is not configured.
func buildEnrichers(cfg *config.Config, logger *zap.Logger) (book domain.Enricher, filmTV domain.Enricher) {
	e := cfg.Enrichment
	if e.ISBNdbAPIKey == "" && e.TMDBAPIKey == "" {
		return nil, nil
	}

	// Load AWS config only if we actually need S3.
	var uploader *enrichment.S3Uploader
	if e.S3Bucket != "" {
		awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
			awsconfig.WithRegion(e.S3Region),
		)
		if err != nil {
			logger.Warn("failed to load AWS config, enrichment disabled", zap.Error(err))
			return nil, nil
		}
		s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
			o.Region = e.S3Region
		})
		uploader = enrichment.NewS3Uploader(s3Client, e.S3Bucket, e.S3Region)
	}

	if e.ISBNdbAPIKey != "" && uploader != nil {
		book = enrichment.NewISBNdbEnricher(e.ISBNdbAPIKey, uploader)
		logger.Info("ISBNdb enricher enabled")
	}
	if e.TMDBAPIKey != "" && uploader != nil {
		filmTV = enrichment.NewTMDBEnricher(e.TMDBAPIKey, uploader)
		logger.Info("TMDB enricher enabled")
	}

	return book, filmTV
}
