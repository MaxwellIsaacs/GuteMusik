#!/bin/bash
# Build script for GuteMusik plugins
# Usage: ./build.sh

set -e

PLUGIN_ID=$(cat manifest.json | grep '"id"' | cut -d'"' -f4)
OUTPUT_FILE="${PLUGIN_ID}.gutemusik"

echo "Building plugin: $PLUGIN_ID"

# For simple plugins, just bundle with esbuild
# Install esbuild if you don't have it: npm install -g esbuild
if command -v esbuild &> /dev/null; then
  esbuild index.tsx --bundle --format=iife --outfile=index.js --external:react --minify
else
  echo "esbuild not found. Install with: npm install -g esbuild"
  echo "Or manually create index.js from index.tsx"
  exit 1
fi

# Create the .gutemusik package (zip file)
zip -j "$OUTPUT_FILE" manifest.json index.js

echo "Created: $OUTPUT_FILE"
echo "Import this file in GuteMusik Settings > Plugins > Import"
