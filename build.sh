#!/bin/sh
# Builds dist/<plugin-id>-<version>.tar.gz: tests and builds the Go server part and the webapp.
# Locally it runs inside Go and Node containers, so only Docker is needed; in CI (CI=true)
# Go and Node are already installed and run directly.
# Usage: ./build.sh
set -eu
cd "$(dirname "$0")"

server_steps='test -z "$(gofmt -l .)" && go vet ./... && go test ./... &&
for arch in amd64 arm64; do
    CGO_ENABLED=0 GOOS=linux GOARCH=$arch go build -trimpath -ldflags="-s -w" -o dist/plugin-linux-$arch .
done'
webapp_steps='npm ci --no-audit --no-fund && npm test && npm run build'

if [ "${CI:-}" = true ]; then
    (cd server && sh -c "$server_steps")
    (cd webapp && sh -c "$webapp_steps")
else
    # Module and build caches persist in scratchpad/ (ignored by git) between runs.
    mkdir -p scratchpad/go
    docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e GOPATH=/cache/gopath -e GOCACHE=/cache/build \
        -v "$PWD/scratchpad/go:/cache" -v "$PWD:/src" -w /src/server golang:1.27-alpine sh -c "$server_steps"
    docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/src" -w /src/webapp node:22-alpine sh -c "$webapp_steps"
fi

id=$(sed -n 's/^ *"id": *"\([^"]*\)".*/\1/p' plugin.json)
version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' plugin.json)

rm -rf dist && mkdir -p "dist/$id/server" "dist/$id/webapp"
cp plugin.json "dist/$id/"
cp -r server/dist "dist/$id/server/"
cp -r webapp/dist "dist/$id/webapp/"
tar -czf "dist/$id-$version.tar.gz" -C dist "$id"
rm -rf "dist/$id"
echo "dist/$id-$version.tar.gz"
