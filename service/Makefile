# edwt-next Go worker (edwtd). Run from the service/ directory.

BINARY      := edwtd
PKG         := ./cmd/edwtd
BIN_DIR     := bin
LDFLAGS     := -s -w
BUILD_FLAGS := -trimpath -ldflags="$(LDFLAGS)"
IMAGE       := edwt-worker

# Raspberry Pi 4 (aarch64) deploy target. Override on the CLI if these change,
# e.g. `make deploy-pi PI_HOST=pi@raspberrypi.local`.
PI_HOST     := pi@10.0.0.73
PI_BIN      := /usr/local/bin/edwtd

.DEFAULT_GOAL := build

.PHONY: build
build: ## Build the stripped, trimmed binary into bin/
	go build $(BUILD_FLAGS) -o $(BIN_DIR)/$(BINARY) $(PKG)

.PHONY: build-pi
build-pi: ## Cross-compile the aarch64 (Raspberry Pi 4) binary into bin/
	GOOS=linux GOARCH=arm64 go build $(BUILD_FLAGS) -o $(BIN_DIR)/$(BINARY)-arm64 $(PKG)

.PHONY: deploy-pi
deploy-pi: build-pi ## Build arm64, copy to the Pi, swap the binary, and restart edwtd
	scp -q $(BIN_DIR)/$(BINARY)-arm64 $(PI_HOST):/tmp/edwtd.new
	ssh $(PI_HOST) 'set -e; \
		sudo cp -a $(PI_BIN) $(PI_BIN).bak; \
		sudo install -m0755 -o root -g root /tmp/edwtd.new $(PI_BIN); \
		sudo systemctl restart edwtd; \
		rm -f /tmp/edwtd.new; \
		sleep 5; systemctl is-active edwtd'

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
