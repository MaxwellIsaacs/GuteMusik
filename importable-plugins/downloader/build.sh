#!/bin/bash
# Build script for Downloader plugin
set -e

PLUGIN_ID="downloader"
OUTPUT_FILE="${PLUGIN_ID}.gutemusik"

echo "Building plugin: $PLUGIN_ID"

# Bundle the plugin - externalize React (provided by GuteMusik API)
npx esbuild index.tsx \
  --bundle \
  --format=iife \
  --outfile=index.js \
  --external:react \
  --minify \
  --target=es2020

echo "Built index.js"

# Create the .gutemusik package (optional - you can also import the folder directly)
if command -v zip &> /dev/null; then
  zip -j "$OUTPUT_FILE" manifest.json index.js
  echo "Created: $OUTPUT_FILE"
fi

echo ""
echo "To install:"
echo "  1. Drag this folder into GuteMusik Settings > Plugins"
echo "  2. Or import the $OUTPUT_FILE file"
