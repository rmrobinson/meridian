.PHONY: build test generate

build:
	GOWORK=off go build -o bin/meridiand ./cmd/meridiand

test:
	GOWORK=off go test ./...

generate:
	cd ../proto && buf generate
