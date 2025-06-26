import * as cheerio from "cheerio";
import { writeFile } from "fs/promises";
import { join } from "path";
import pLimit from "p-limit";
import { mkdirSync, existsSync } from "fs";
import { supabase } from "./supabase";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

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

const LINKS = [
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=J2+Dining&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12(a)&locationName=JCL+Dining&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=03&locationName=Kins+Dining&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=05&locationName=Jester+City+Market&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=26&locationName=Jesta'+Pizza&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=19&locationName=Littlefield+Patio+Cafe&naFlag=1",
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=08&locationName=Cypress+Bend+Cafe+&naFlag=1",
];

const DATA_DIR = join(__dirname, "..", "data");
const NUTRITION_CONCURRENCY = process.env.NUTRITION_CONCURRENCY ? parseInt(process.env.NUTRITION_CONCURRENCY) : 50;
const MENU_CONCURRENCY = process.env.MENU_CONCURRENCY ? parseInt(process.env.MENU_CONCURRENCY) : 7;
const ENABLE_SUPABASE = process.env.ENABLE_SUPABASE === "true";

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Fetch HTML content with error handling and retries
const fetchHtml = async (url: string, retries = 3): Promise<string | null> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      if (i === 0) {
        console.error(
          `❌ Failed to fetch ${
            new URL(url).searchParams.get("locationName") || "page"
          }: ${error instanceof Error ? error.message : error}`
        );
      }
      if (i === retries - 1) return null;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
  return null;
};

const scrapeNutritionInfo = async (url: string): Promise<Nutrition | null> => {
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
            return false; // Break the loop
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
    console.error(`🍔 Failed to scrape nutrition for food item:`, error);
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

          // Initialize allergens
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

          // Collect all allergen icons
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
    console.error("Error parsing menu structure:", error);
    return [];
  }
};

const scrapeMenuData = async (url: string) => {
  try {
    const html = await fetchHtml(url);
    if (!html) return null;

    const $ = cheerio.load(html);

    // Extract menu date
    const menuDateElement = $("div.shortmenutitle").text();
    const menuDateMatch = menuDateElement.match(/Menus for (.+)/);
    const menuDate = menuDateMatch
      ? new Date(menuDateMatch[1].trim()).toISOString().slice(0, 10)
      : null;

    // Find menu links
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

    const urlObj = new URL(url);
    const locationName =
      urlObj.searchParams.get("locationName")?.trim() || "Unknown Location";

    console.log(
      `🏢 Processing ${locationName} (${menuLinks.length} menu${
        menuLinks.length !== 1 ? "s" : ""
      } found)`
    );

    const menuLimit = pLimit(3);
    const menus = await Promise.all(
      menuLinks.map((link) =>
        menuLimit(async () => {
          try {
            const menuHtml = await fetchHtml(link);
            if (!menuHtml) return null;

            const menu$ = cheerio.load(menuHtml);

            // Extract category name
            const categoryElement = menu$("a:has(div.longmenugridheader)");
            const categoryText = categoryElement.text();
            const category =
              categoryText.split("Menu")[0].replace(/ /g, "").trim() ||
              "Unknown";

            const baseMenu = parseMenuStructure(menu$);

            // Return null if no menu categories found
            if (baseMenu.length === 0) {
              return null;
            }

            const totalFoods = baseMenu.reduce(
              (sum, section) => sum + section.foods.length,
              0
            );
            console.log(
              `  📋 ${category} menu: ${totalFoods} food items across ${baseMenu.length} categories`
            );

            // Scrape nutrition info for all foods in parallel
            const nutritionLimit = pLimit(NUTRITION_CONCURRENCY);
            const foodsWithNutrition = await Promise.all(
              baseMenu.flatMap((section) =>
                section.foods.map(async (food) => {
                  if (!food.link) return food;

                  const nutrition = await nutritionLimit(() =>
                    scrapeNutritionInfo(food.link)
                  );

                  return { ...food, nutrition };
                })
              )
            );

            // Rebuild menu structure with nutrition data and remove duplicates
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

            // Filter out sections with no foods and return null if no sections remain
            const finalMenu = enhancedMenu.filter(
              (section) => section.foods.length > 0
            );
            if (finalMenu.length === 0) {
              return null;
            }

            const nutritionCount = finalMenu.reduce(
              (sum, section) =>
                sum + section.foods.filter((food) => food.nutrition).length,
              0
            );
            console.log(
              `  ✅ ${category}: ${nutritionCount}/${totalFoods} items with nutrition data`
            );

            return { type: category, menuCategories: finalMenu };
          } catch (error) {
            console.error(`❌ Error processing menu: ${link}`, error);
            return null;
          }
        })
      )
    );

    const filteredMenus = menus.filter((m) => m !== null);

    return {
      locationName,
      date: menuDate,
      menus: filteredMenus,
    };
  } catch (error) {
    console.error(`❌ Error processing ${url}:`, error);
    return null;
  }
};

(async () => {
  const startTime = Date.now();
  console.log("🚀 Starting menu scraping with Cheerio...");

  try {
    const menuUrlsSet = new Set<string>(LINKS);
    console.log(`📍 Found ${menuUrlsSet.size} dining locations to process`);

    const scraperLimit = pLimit(MENU_CONCURRENCY);
    const rawData = await Promise.all(
      Array.from(menuUrlsSet).map((url) =>
        scraperLimit(() => scrapeMenuData(url))
      )
    );

    console.log("🎉 Scraping complete!");

    const data = rawData.filter((item) => item !== null);
    const totalLocations = data.length;
    const totalMenus = data.reduce(
      (sum, location) => sum + location.menus.length,
      0
    );
    const totalFoodItems = data.reduce(
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

    console.log(
      `📊 Scraped ${totalLocations} locations, ${totalMenus} menus, ${totalFoodItems} food items`
    );

    // Generate json file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `ut_menus_${timestamp}.json`;
    const filePath = join(DATA_DIR, fileName);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`💾 Data saved to ${filePath}`);

    if (ENABLE_SUPABASE) {
      console.log("☁️ Inserting into Supabase...");

      const { data: supabaseData, error } = await supabase.rpc(
        "insert_multiple_locations_and_menus",
        {
          arg_data_array: data as any,
        }
      );

      if (error) {
        console.error("❌ Error inserting data:", error);
      } else {
        console.log("✅ Data inserted successfully:", supabaseData);
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`⏱️ Total scraping time: ${duration.toFixed(2)} seconds`);
  } catch (error) {
    console.error("💥 Fatal error:", error);
  }
})();
