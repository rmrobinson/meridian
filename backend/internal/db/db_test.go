package db_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/rmrobinson/meridian/backend/internal/db"
)

// openTestDB opens a uniquely named in-memory SQLite database per test with
// migrations applied. Each test gets an isolated database.
func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	// Use the test name as the database name so each test is fully isolated.
	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", name)
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}
