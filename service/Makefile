# edwt-next Go worker (edwtd). Run from the service/ directory.

BINARY      := edwtd
PKG         := ./cmd/edwtd
BIN_DIR     := bin
LDFLAGS     := -s -w
BUILD_FLAGS := -trimpath -ldflags="$(LDFLAGS)"
IMAGE       := edwt-worker

.DEFAULT_GOAL := build

.PHONY: build
build: ## Build the stripped, trimmed binary into bin/
	go build $(BUILD_FLAGS) -o $(BIN_DIR)/$(BINARY) $(PKG)

.PHONY: run
run: ## Run the worker (reads env / .env from the shell)
	go run $(PKG)

.PHONY: test
test: ## Run unit tests
	go test ./...

.PHONY: test-race
test-race: ## Run tests with the race detector
	go test -race ./...

.PHONY: cover
cover: ## Run tests and print coverage summary
	go test -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | tail -1

.PHONY: vet
vet: ## go vet
	go vet ./...

.PHONY: fmt
fmt: ## Format the code in place
	gofmt -w .

.PHONY: fmt-check
fmt-check: ## Fail if any file is not gofmt-clean
	@unformatted="$$(gofmt -l .)"; \
	if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi

.PHONY: lint
lint: ## Run golangci-lint if installed
	@command -v golangci-lint >/dev/null 2>&1 && golangci-lint run || echo "golangci-lint not installed; skipping"

.PHONY: tidy
tidy: ## Sync go.mod/go.sum
	go mod tidy

.PHONY: docker
docker: ## Build the container image
	docker build -t $(IMAGE) .

.PHONY: ci
ci: fmt-check vet test build ## What CI runs

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf $(BIN_DIR) coverage.out

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
