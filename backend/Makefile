.PHONY: build test generate

build:
	GOWORK=off go build ./...

test:
	GOWORK=off go test ./...

generate:
	cd ../proto && buf generate
