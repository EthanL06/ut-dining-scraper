# 🚀 Quick Start Guide

Get up and running with the UT Dining Scraper in 5 minutes!

## ⚡ One-Command Setup

```bash
# Install dependencies and build
pnpm install && pnpm build

# Run the scraper
pnpm start
```

## 🎯 Most Common Use Cases

### 1. Basic Menu Scraping

```bash
node dist/index.js
```

**Output**: JSON file in `data/` folder with all menu data

### 2. Find Optimal Performance Settings

```bash
./run-performance-test.sh
```

**Output**: Recommended concurrency settings for your network

## 📊 Understanding Your Results

### JSON Output Structure

```json
{
  "locationName": "J2 Dining",
  "menus": [
    {
      "type": "Lunch",
      "menuCategories": [
        {
          "categoryName": "Main Dishes",
          "foods": [
            {
              "name": "Grilled Chicken",
              "allergens": { "milk": false, "wheat": true },
              "nutrition": {
                "calories": 250,
                "protein": "25g",
                "totalFat": "8g"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Performance Test Results

- **Best Score** = Highest throughput with >95% success rate
- **Apply Settings** = Update `NUTRITION_CONCURRENCY` and `MENU_CONCURRENCY` in `src/index.ts`

## 🔧 Quick Configuration

### Speed vs Reliability

```typescript
// Conservative (slower, more reliable)
const NUTRITION_CONCURRENCY = 30;
const MENU_CONCURRENCY = 6;

// Aggressive (faster, might have more errors)
const NUTRITION_CONCURRENCY = 80;
const MENU_CONCURRENCY = 10;
```

### Target Specific Locations

```typescript
const LINKS = [
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?locationName=J2+Dining",
  // Comment out locations you don't need
];
```

## 🆘 Quick Fixes

### "Permission denied" on run-performance-test.sh

```bash
chmod +x run-performance-test.sh
```

### High error rate

```typescript
// Reduce these values in src/index.ts
const NUTRITION_CONCURRENCY = 20; // Lower this
const MENU_CONCURRENCY = 5; // Lower this
```

### Slow performance

```bash
# Run performance test to find optimal settings
./run-performance-test.sh
```

## 📱 Next Steps

1. **Run your first scrape** with default settings
2. **Run performance test** to optimize for your network
3. **Apply optimal settings** from performance test results
4. **Set up automated runs** if needed

That's it! You're ready to scrape UT dining data efficiently! 🎉
