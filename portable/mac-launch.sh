#!/bin/sh
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec "$APP_DIR/Resources/node" "$APP_DIR/Resources/iniciar.mjs"
