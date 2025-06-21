#!/bin/bash

echo "🚀 Starting Concurrency Performance Test"
echo "This will test different concurrency values to find optimal settings"
echo "Expected runtime: 5-10 minutes"
echo ""

# Build the TypeScript
echo "📦 Building TypeScript..."
pnpm build

# Run the performance test
echo "🧪 Running performance tests..."
node dist/performance-test.js

echo ""
echo "✅ Performance test complete!"
echo "Check the performance-test-results/ directory for detailed results"
