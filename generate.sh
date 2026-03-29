#!/usr/bin/env bash
set -euo pipefail

echo "Running buf generate..."
cd proto && buf generate
echo "Proto generation complete."
