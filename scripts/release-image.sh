#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${SENSORSPHERE_IMAGE_REGISTRY:-ghcr.io}"
NAMESPACE="${SENSORSPHERE_IMAGE_NAMESPACE:-sensorsphere}"
IMAGE="${REGISTRY}/${NAMESPACE}/sensorsphere-simulator"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

VERSION="$(sed -n 's/^export const MODULE_VERSION = "\([^"]*\)";/\1/p' src/module_version.js | head -1)"
[[ -n "$VERSION" ]] || { echo "ERROR: unable to determine MODULE_VERSION" >&2; exit 1; }

PACKAGE_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -1)"
[[ "$VERSION" == "$PACKAGE_VERSION" ]] || {
  echo "ERROR: module version ($VERSION) does not match package.json ($PACKAGE_VERSION)" >&2
  exit 1
}

REVISION="$(git rev-parse HEAD)"
SOURCE_URL="https://github.com/sensorsphere/sensorsphere-simulator"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree must be clean before publishing" >&2
  exit 1
fi

for ref in "$IMAGE:$VERSION" "$IMAGE:sha-$REVISION"; do
  if docker buildx imagetools inspect "$ref" >/dev/null 2>&1; then
    echo "ERROR: immutable image tag already exists: $ref" >&2
    exit 1
  fi
done

docker buildx build \
  --platform "$PLATFORMS" \
  --provenance=mode=max \
  --sbom=true \
  --label "org.opencontainers.image.source=$SOURCE_URL" \
  --label "org.opencontainers.image.version=$VERSION" \
  --label "org.opencontainers.image.revision=$REVISION" \
  --tag "$IMAGE:$VERSION" \
  --tag "$IMAGE:sha-$REVISION" \
  --push \
  .

docker buildx imagetools inspect "$IMAGE:$VERSION"
docker buildx imagetools inspect "$IMAGE:sha-$REVISION"
