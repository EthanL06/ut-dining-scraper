# UT Dining Scraper

A high-performance web scraper for University of Texas dining hall menus, built with TypeScript, Cheerio, and Supabase integration. This tool scrapes menu data, nutrition information, and allergen details from the UT dining system.

## 🚀 Features

- **Fast Scraping**: Uses Cheerio and fetch for lightweight, efficient scraping
- **Parallel Processing**: Configurable concurrency for optimal performance
- **Nutrition Data**: Extracts detailed nutrition facts for each menu item
- **Allergen Information**: Identifies allergens and dietary restrictions
- **Supabase Integration**: Direct database insertion capabilities
- **Performance Testing**: Built-in performance testing suite
- **Error Handling**: Robust retry mechanisms and error recovery
- **TypeScript**: Full type safety and IntelliSense support

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **pnpm** (package manager)
- **TypeScript** (installed globally or via pnpm)

## 🛠️ Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd ut-dining-scraper
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables** (optional, for Supabase)

   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

4. **Build the project**
   ```bash
   pnpm build
   ```

## 🏃‍♂️ Quick Start

### Basic Usage

1. **Run the scraper**

   ```bash
   pnpm start
   # or
   node dist/index.js
   ```

2. **Output**
   - JSON file saved to `data/` directory
   - Console output with progress and statistics
   - Optional Supabase insertion (if configured)

### Example Output

```
🚀 Starting menu scraping with Cheerio...
📍 Found 7 dining locations to process
🏢 Processing J2 Dining (3 menus found)
  📋 Lunch menu: 74 food items across 12 categories
  ✅ Lunch: 74/74 items with nutrition data
📊 Scraped 7 locations, 3 menus, 177 food items
💾 Data saved to data/ut_menus_2025-06-21T16-42-58-936Z.json
⏱️ Total scraping time: 4.32 seconds
```

## ⚙️ Configuration

### Concurrency Settings

Located in `src/index.ts`:

```typescript
const NUTRITION_CONCURRENCY = 50; // Parallel nutrition requests
const MENU_CONCURRENCY = 7; // Parallel menu page requests
```

### Dining Locations

Modify the `LINKS` array in `src/index.ts` to add/remove locations:

```typescript
const LINKS = [
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?locationName=J2+Dining",
  // Add more locations here
];
```

### Supabase Integration

1. **Enable Supabase** by setting `ENABLE_SUPABASE` in your `.env` file:

   ```env
   ENABLE_SUPABASE=true # Set to true to enable Supabase insertion, or false to disable
   ```

2. **Configure credentials** in `.env`:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_anon_key
   ```

## 📊 Performance Testing

The project includes a comprehensive performance testing suite to find optimal concurrency settings.

### 🧪 Running Performance Tests

#### Option 1: Using the Script (Recommended)

```bash
chmod +x run-performance-test.sh
./run-performance-test.sh
```

#### Option 2: Manual Commands

```bash
pnpm build
node dist/performance-test.js
```

### 📈 What the Performance Test Does

The performance test systematically evaluates different concurrency configurations:

| Test Config  | Nutrition Concurrency | Menu Concurrency | Purpose          |
| ------------ | --------------------- | ---------------- | ---------------- |
| Conservative | 20                    | 5                | Safe baseline    |
| Low          | 30                    | 6                | Light load       |
| Baseline     | 40                    | 7                | Current default  |
| Moderate     | 50                    | 7                | Recommended      |
| Aggressive   | 60-70                 | 8                | High performance |
| Maximum      | 80-100                | 9-10             | Stress test      |

### 📊 Performance Metrics

Each test measures:

- **⏱️ Duration**: Total scraping time
- **🔢 Items/Second**: Processing throughput
- **✅ Success Rate**: Percentage of successful nutrition fetches
- **❌ Error Count**: Number of failed requests
- **🏆 Composite Score**: Overall performance rating

### 📋 Sample Performance Test Output

```
🧪 Testing: Nutrition=50, Menu=7
   ⏱️  Duration: 4.12s
   📊 Items: 177 (43.0/s)
   ✅ Success Rate: 98.3%
   ❌ Errors: 3

📈 PERFORMANCE TEST RESULTS
═══════════════════════════════════════════════════════════════════════════════
Nutrition | Menu | Duration | Items/s | Success% | Errors | Score
───────────────────────────────────────────────────────────────────────────────
       20 |    5 |     8.45s |    20.9 |    100.0 |      0 | 20.90
       50 |    7 |     4.12s |    43.0 |     98.3 |      3 | 41.27
       70 |    8 |     3.21s |    55.1 |     96.6 |      6 | 51.89

🏆 OPTIMAL CONFIGURATION:
   Nutrition Concurrency: 70
   Menu Concurrency: 8
   Performance: 55.1 items/second
   Success Rate: 96.6%
   Duration: 3.21 seconds
```

### 📁 Performance Test Results

Results are automatically saved to:

- **Console**: Real-time progress and summary
- **JSON File**: `performance-test-results/performance_test_[timestamp].json`

### 🎯 Interpreting Results

**Look for:**

- ✅ Success rate > 95%
- ⚡ High items/second ratio
- 🎯 Low error count
- 🏆 High composite score

**Warning signs:**

- ❌ Success rate < 90%
- 🐌 Decreasing items/second despite higher concurrency
- 💥 High error count

### ⚡ Applying Optimal Settings

After running performance tests, update your configuration in `src/index.ts`:

```typescript
// Use the optimal values from your performance test results
const NUTRITION_CONCURRENCY = 70; // Example optimal value
const MENU_CONCURRENCY = 8; // Example optimal value
```

## 📁 Project Structure

```
ut-dining-scraper/
├── src/
│   ├── index.ts              # Main scraper application
│   ├── performance-test.ts   # Performance testing suite
│   ├── supabase.ts          # Supabase configuration
│   └── types/               # TypeScript type definitions
├── data/                    # Scraped menu data (JSON files)
├── performance-test-results/ # Performance test results
├── dist/                    # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── run-performance-test.sh  # Performance test runner script
```

## 🚨 Troubleshooting

### Common Issues

**Slow Performance**

- Run performance tests to find optimal concurrency
- Check network connection
- Verify server isn't rate-limiting

**High Error Rates**

- Reduce concurrency values
- Check if dining sites are accessible
- Verify network stability

**TypeScript Errors**

```bash
# Clean build
rm -rf dist/
pnpm build
```

**Permission Errors**

```bash
chmod +x run-performance-test.sh
```

## 📜 Available Scripts

```bash
# Build the project
pnpm build

# Run the main scraper
pnpm start

# Run performance tests
pnpm run performance-test:script

# Development mode with watch
pnpm dev

# Clean build artifacts
pnpm clean

# One-command setup
pnpm quick-start
```

📋 **For a complete commands reference, see [COMMANDS.md](COMMANDS.md)**

## 📚 Documentation

- **[README.md](README.md)** - Main documentation (you are here)
- **[QUICK_START.md](QUICK_START.md)** - Get running in 5 minutes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run performance tests to ensure no regression
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🙋‍♂️ Support

For issues and questions:

1. Check the troubleshooting section
2. Run performance tests to identify configuration issues
3. Create an issue with relevant logs and configuration details
