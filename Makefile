.PHONY: check test build format
check:
	npm run check
	npm run format:check
	cd agent && go vet ./...
test:
	npm test
	cd agent && go test -race ./...
build:
	npm run build
	cd agent && go build -o nemu ./cmd/nemu
format:
	npm run format
	gofmt -w agent
