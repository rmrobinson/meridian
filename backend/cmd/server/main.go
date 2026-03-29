package main

import (
	"flag"
	"os"

	"go.uber.org/zap"

	"github.com/rmrobinson/meridian/backend/internal/config"
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
		os.Exit(1)
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
}
