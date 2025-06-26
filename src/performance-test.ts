import * as cheerio from "cheerio";
import { writeFile } from "fs/promises";
import { join } from "path";
import pLimit from "p-limit";
import { mkdirSync, existsSync } from "fs";

interface AllergenInfo {
  beef: boolean;
  egg: boolean;
  fish: boolean;
  milk: boolean;
  peanuts: boolean;
  pork: boolean;
  shellfish: boolean;
  soy: boolean;
  tree_nuts: boolean;
  wheat: boolean;
  sesame_seeds: boolean;
  vegan: boolean;
  vegetarian: boolean;
  halal: boolean;
}

interface Section {
  categoryName: string;
  foods: Food[];
}

interface Food {
  name: string;
  link: string;
  allergens: AllergenInfo;
  nutrition?: Nutrition;
}

interface Nutrition {
  servingSize: string;
  calories: number;
  totalFat: string;
  saturatedFat: string;
  transFat: string;
  cholesterol: string;
  totalCarbohydrates: string;
  dietaryFiber: string;
  totalSugars: string;
  protein: string;
  vitaminD: string;
  calcium: string;
  iron: string;
  potassium: string;
  sodium: string;
  ingredients?: string;
}

interface TestResult {
  nutritionConcurrency: number;
  menuConcurrency: number;
  duration: number;
  totalItems: number;
  successRate: number;
  itemsPerSecond: number;
  errors: number;
  memoryUsage: number;
}

// Test configurations to try
const TEST_CONFIGS = [
  { nutrition: 20, menu: 5 },
  { nutrition: 30, menu: 6 },
  { nutrition: 40, menu: 7 },
  { nutrition: 50, menu: 7 },
  { nutrition: 60, menu: 8 },
  { nutrition: 70, menu: 8 },
  { nutrition: 80, menu: 9 },
  { nutrition: 100, menu: 10 },
];

const LINKS = [
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12(a)&locationName=JCL+Dining&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=03&locationName=Kins+Dining&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=05&locationName=Jester+City+Market&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=26&locationName=Jesta'+Pizza&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=19&locationName=Littlefield+Patio+Cafe&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=08&locationName=Cypress+Bend+Cafe+&naFlag=1",
];

// const LINKS = [
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f20%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f21%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f22%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f23%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f24%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f25%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f26%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f27%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f28%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f29%2f2025",
//   "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1&WeeksMenus=This+Week%27s+Menus&myaction=read&dtdate=6%2f30%2f2025",
// ];

const DATA_DIR = join(__dirname, "..", "performance-test-results");

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let errorCount = 0;

// Fetch HTML content with error handling and retries
const fetchHtml = async (url: string, retries = 3): Promise<string | null> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      if (i === 0) {
        errorCount++;
      }
      if (i === retries - 1) return null;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return null;
};

const scrapeNutritionInfo = async (
  url: string,
  nutritionConcurrency: number
): Promise<Nutrition | null> => {
  try {
    const html = await fetchHtml(url);
    if (!html) return null;

    const $ = cheerio.load(html);

    const getNutrient = (label: string) => {
      const elements = $(".nutfactstopnutrient");
      let result = null;

      elements.each((_, element) => {
        const text = $(element).text();
        if (text.includes(label)) {
          const match = text.match(/([\d.]+)\s*([a-zA-Zμ]+)/);
          if (match) {
            result = `${match[1]}${match[2]}`;
            return false;
          }
        }
      });

      return result;
    };

    const servingSizeElements = $(".nutfactsservsize");
    const servingSize =
      servingSizeElements.length > 1
        ? $(servingSizeElements[1]).text().trim()
        : "";

    const caloriesText = $(".nutfactscaloriesval").text().trim();
    const calories = parseFloat(caloriesText) || 0;

    const ingredients = $(".labelingredientsvalue").text().trim() || undefined;

    return {
      servingSize,
      calories,
      totalFat: getNutrient("Total Fat") || "0g",
      saturatedFat: getNutrient("Saturated Fat") || "0g",
      transFat: getNutrient("Trans Fat") || "0g",
      cholesterol: getNutrient("Cholesterol") || "0mg",
      sodium: getNutrient("Sodium") || "0mg",
      totalCarbohydrates: getNutrient("Total Carbohydrate") || "0g",
      dietaryFiber: getNutrient("Dietary Fiber") || "0g",
      totalSugars: getNutrient("Total Sugars") || "0g",
      protein: getNutrient("Protein") || "0g",
      vitaminD: getNutrient("Vitamin D") || "0mcg",
      calcium: getNutrient("Calcium") || "0mg",
      iron: getNutrient("Iron") || "0mg",
      potassium: getNutrient("Potassium") || "0mg",
      ingredients,
    };
  } catch (error) {
    errorCount++;
    return null;
  }
};

const parseMenuStructure = ($: cheerio.CheerioAPI): Section[] => {
  try {
    const sectionMap = new Map<string, Section>();
    let currentSection: Section | null = null;

    $("tbody tr").each((_, row) => {
      const $row = $(row);
      const categoryHeader = $row.find(".longmenucolmenucat");

      if (categoryHeader.length > 0) {
        const categoryName =
          categoryHeader
            .text()
            .replace(/^--\s*|[\s-]*$/g, "")
            .trim() || "Uncategorized";

        currentSection = sectionMap.get(categoryName) || {
          categoryName,
          foods: [],
        };
        sectionMap.set(categoryName, currentSection);
      } else if (currentSection) {
        const foodLink = $row.find(".longmenucoldispname a");
        const foodCheckBox = $row.find(
          '.longmenucoldispname input[type="checkbox"]'
        );

        if (foodLink.length > 0 && foodCheckBox.length > 0) {
          const foodName = foodLink.text().trim();
          if (!foodName) return;

          const allergenMap = new Map<string, boolean>([
            ["beef", false],
            ["egg", false],
            ["fish", false],
            ["milk", false],
            ["peanuts", false],
            ["pork", false],
            ["shellfish", false],
            ["soy", false],
            ["tree_nuts", false],
            ["wheat", false],
            ["sesame_seeds", false],
            ["vegan", false],
            ["vegetarian", false],
            ["halal", false],
          ]);

          const allergenIcons = $row.find("img");
          allergenIcons.each((_, img) => {
            const imgSrc = $(img).attr("src");
            if (!imgSrc) return;

            const filename = imgSrc
              .substring(imgSrc.lastIndexOf("/") + 1)
              .replace(".png", "")
              .toLowerCase()
              .replace(/ /g, "_");

            const allergenKeyMap: { [key: string]: keyof AllergenInfo } = {
              beef: "beef",
              eggs: "egg",
              egg: "egg",
              fish: "fish",
              milk: "milk",
              peanuts: "peanuts",
              pork: "pork",
              shellfish: "shellfish",
              soy: "soy",
              tree_nuts: "tree_nuts",
              wheat: "wheat",
              sesame: "sesame_seeds",
              vegan: "vegan",
              veggie: "vegetarian",
            };

            const allergenKey = allergenKeyMap[filename];
            if (allergenKey && allergenMap.has(allergenKey)) {
              allergenMap.set(allergenKey, true);
            }
          });

          const allergens = Object.fromEntries(
            allergenMap
          ) as unknown as AllergenInfo;

          const existingIndex = currentSection.foods.findIndex(
            (f) => f.name === foodName
          );

          if (existingIndex === -1) {
            const href = foodLink.attr("href");
            const fullLink = href?.startsWith("http")
              ? href
              : `https://hf-foodpro.austin.utexas.edu/foodpro/${href}`;

            currentSection.foods.push({
              name: foodName,
              link: fullLink,
              allergens,
            });
          }
        }
      }
    });

    return Array.from(sectionMap.values()).filter(
      (section) => section.foods.length > 0
    );
  } catch (error) {
    errorCount++;
    return [];
  }
};

const scrapeMenuData = async (
  url: string,
  nutritionConcurrency: number,
  menuConcurrency: number
) => {
  try {
    const html = await fetchHtml(url);
    if (!html) return null;

    const $ = cheerio.load(html);

    const menuLinks: string[] = [];
    $('a[href*="longmenu.aspx"]').each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        const fullLink = href.startsWith("http")
          ? href
          : `https://hf-foodpro.austin.utexas.edu/foodpro/${href}`;
        menuLinks.push(fullLink);
      }
    });

    const menuLimit = pLimit(3);
    const menus = await Promise.all(
      menuLinks.map((link) =>
        menuLimit(async () => {
          try {
            const menuHtml = await fetchHtml(link);
            if (!menuHtml) return null;

            const menu$ = cheerio.load(menuHtml);

            const categoryElement = menu$("a:has(div.longmenugridheader)");
            const categoryText = categoryElement.text();
            const category =
              categoryText.split("Menu")[0].replace(/ /g, "").trim() ||
              "Unknown";

            const baseMenu = parseMenuStructure(menu$);

            if (baseMenu.length === 0) {
              return null;
            }

            const nutritionLimit = pLimit(nutritionConcurrency);
            const foodsWithNutrition = await Promise.all(
              baseMenu.flatMap((section) =>
                section.foods.map(async (food) => {
                  if (!food.link) return food;

                  const nutrition = await nutritionLimit(() =>
                    scrapeNutritionInfo(food.link, nutritionConcurrency)
                  );

                  return { ...food, nutrition };
                })
              )
            );

            const enhancedMenu = baseMenu.map((section) => {
              const seenFoodNames = new Set();
              const uniqueFoods = section.foods
                .map((food) => {
                  const foodWithNutrition = foodsWithNutrition.find(
                    (f) => f.name === food.name
                  );
                  return foodWithNutrition || food;
                })
                .filter((food) => {
                  if (seenFoodNames.has(food.name)) {
                    return false;
                  }
                  seenFoodNames.add(food.name);
                  return true;
                });

              return {
                ...section,
                foods: uniqueFoods,
              };
            });

            const finalMenu = enhancedMenu.filter(
              (section) => section.foods.length > 0
            );
            if (finalMenu.length === 0) {
              return null;
            }

            return { type: category, menuCategories: finalMenu };
          } catch (error) {
            errorCount++;
            return null;
          }
        })
      )
    );

    const urlObj = new URL(url);
    const locationName =
      urlObj.searchParams.get("locationName")?.trim() || "Unknown Location";
    const filteredMenus = menus.filter((m) => m !== null);

    return {
      locationName,
      menus: filteredMenus,
    };
  } catch (error) {
    errorCount++;
    return null;
  }
};

const runPerformanceTest = async (
  nutritionConcurrency: number,
  menuConcurrency: number
): Promise<TestResult> => {
  console.log(
    `\n🧪 Testing: Nutrition=${nutritionConcurrency}, Menu=${menuConcurrency}`
  );

  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  errorCount = 0;

  try {
    const menuUrlsSet = new Set<string>(LINKS);
    const scraperLimit = pLimit(menuConcurrency);

    const rawData = await Promise.all(
      Array.from(menuUrlsSet).map((url) =>
        scraperLimit(() =>
          scrapeMenuData(url, nutritionConcurrency, menuConcurrency)
        )
      )
    );

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = (endTime - startTime) / 1000;
    const memoryUsage = (endMemory - startMemory) / 1024 / 1024; // Convert to MB

    const data = rawData.filter((item) => item !== null);
    const totalItems = data.reduce(
      (sum, location) =>
        sum +
        location.menus.reduce(
          (menuSum, menu) =>
            menuSum +
            menu.menuCategories.reduce(
              (catSum, category) => catSum + category.foods.length,
              0
            ),
          0
        ),
      0
    );

    const itemsWithNutrition = data.reduce(
      (sum, location) =>
        sum +
        location.menus.reduce(
          (menuSum, menu) =>
            menuSum +
            menu.menuCategories.reduce(
              (catSum, category) =>
                catSum + category.foods.filter((food) => food.nutrition).length,
              0
            ),
          0
        ),
      0
    );

    const successRate =
      totalItems > 0 ? (itemsWithNutrition / totalItems) * 100 : 0;
    const itemsPerSecond = totalItems / duration;

    const result: TestResult = {
      nutritionConcurrency,
      menuConcurrency,
      duration,
      totalItems,
      successRate,
      itemsPerSecond,
      errors: errorCount,
      memoryUsage,
    };

    console.log(`   ⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log(`   📊 Items: ${totalItems} (${itemsPerSecond.toFixed(1)}/s)`);
    console.log(`   ✅ Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   🧠 Memory Usage: ${memoryUsage.toFixed(2)} MB`);

    return result;
  } catch (error) {
    console.error(`   💥 Test failed:`, error);
    return {
      nutritionConcurrency,
      menuConcurrency,
      duration: -1,
      totalItems: 0,
      successRate: 0,
      itemsPerSecond: 0,
      errors: errorCount,
      memoryUsage: 0,
    };
  }
};

const main = async () => {
  console.log("🚀 Starting Performance Test Suite");
  console.log(
    `📍 Testing ${LINKS.length} locations with ${TEST_CONFIGS.length} different configurations`
  );
  console.log("⚠️  This will take several minutes to complete...\n");

  const results: TestResult[] = [];

  for (const config of TEST_CONFIGS) {
    const result = await runPerformanceTest(config.nutrition, config.menu);
    results.push(result);

    // Add a small delay between tests to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Analyze results
  console.log("\n📈 PERFORMANCE TEST RESULTS");
  console.log("=".repeat(80));
  console.log(
    "Nutrition | Menu | Duration | Items/s | Success% | Errors | Score"
  );
  console.log("-".repeat(80));

  const validResults = results.filter(
    (r) => r.duration > 0 && r.successRate > 90
  );

  results.forEach((result) => {
    const score =
      result.successRate > 90
        ? result.itemsPerSecond *
          (result.successRate / 100) *
          (1 - result.errors / 100)
        : 0;

    console.log(
      `${result.nutritionConcurrency.toString().padStart(9)} | ` +
        `${result.menuConcurrency.toString().padStart(4)} | ` +
        `${result.duration.toFixed(2).padStart(8)}s | ` +
        `${result.itemsPerSecond.toFixed(1).padStart(7)} | ` +
        `${result.successRate.toFixed(1).padStart(8)} | ` +
        `${result.errors.toString().padStart(6)} | ` +
        `${score.toFixed(2).padStart(5)}`
    );
  });

  // Find optimal configuration
  if (validResults.length > 0) {
    const optimal = validResults.reduce((best, current) => {
      const bestScore =
        best.itemsPerSecond *
        (best.successRate / 100) *
        (1 - best.errors / 100);
      const currentScore =
        current.itemsPerSecond *
        (current.successRate / 100) *
        (1 - current.errors / 100);
      return currentScore > bestScore ? current : best;
    });

    console.log("\n🏆 OPTIMAL CONFIGURATION:");
    console.log(`   Nutrition Concurrency: ${optimal.nutritionConcurrency}`);
    console.log(`   Menu Concurrency: ${optimal.menuConcurrency}`);
    console.log(
      `   Performance: ${optimal.itemsPerSecond.toFixed(1)} items/second`
    );
    console.log(`   Success Rate: ${optimal.successRate.toFixed(1)}%`);
    console.log(`   Duration: ${optimal.duration.toFixed(2)} seconds`);
  } else {
    console.log(
      "\n❌ No valid configurations found (all had <90% success rate)"
    );
  }

  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `performance_test_${timestamp}.json`;
  const filePath = join(DATA_DIR, fileName);
  await writeFile(filePath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n💾 Detailed results saved to ${filePath}`);
};

main().catch(console.error);
