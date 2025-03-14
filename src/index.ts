import puppeteer, { Browser, Page } from "puppeteer";
import { writeFile } from "fs/promises";
import { join } from "path";
import pLimit from "p-limit";
import { mkdirSync, existsSync } from "fs";
import { supabase } from "./supabase";

interface AllergenInfo {
  beef: boolean;
  egg: boolean;
  fish: boolean;
  milk: boolean;
  peanuts: boolean;
  pork: boolean;
  sodium: boolean;
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
  ingredients?: string;
}

const BASE_URL = "https://hf-foodpro.austin.utexas.edu/foodpro/location.aspx";
const HEADLESS = true;
const DATA_DIR = join(__dirname, "..", "data");
const NUTRITION_CONCURRENCY = 10; // Lower to avoid overwhelming nutrition pages
const MENU_CONCURRENCY = 7; // Main concurrency control

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const configurePage = async (page: Page) => {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    ["image", "stylesheet", "font", "media"].includes(req.resourceType())
      ? req.abort()
      : req.continue();
  });
  return page;
};

const scrapeNutritionInfo = async (
  browser: Browser,
  url: string
): Promise<Nutrition | null> => {
  const page = await configurePage(await browser.newPage());
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    if (!response?.ok()) return null;

    return await page.evaluate(() => {
      const getNutrient = (label: string) => {
        // Search through all nutrient elements
        const elements = Array.from(
          document.querySelectorAll(".nutfactstopnutrient")
        );
        const element = elements.find((el) => el.textContent?.includes(label));

        if (!element) return null;

        // Extract numeric value with unit
        const match = element.textContent?.match(/([\d.]+)\s*([a-zA-Zμ]+)/);
        return match ? `${match[1]}${match[2]}` : null;
      };

      const servingSize =
        document
          .querySelectorAll(".nutfactsservsize")[1]
          ?.textContent?.trim() || "";

      // Extract calories from the special calories cell
      const calories =
        document.querySelector(".nutfactscaloriesval")?.textContent?.trim() ||
        "0";

      const ingredients = document
        .querySelector(".labelingredientsvalue")
        ?.textContent?.trim();

      return {
        servingSize,
        calories: parseFloat(calories),
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
    });
  } catch (error) {
    console.error(`Nutrition scrape failed for ${url}:`, error);
    return null;
  } finally {
    await page.close();
  }
};

const scrapeMenuData = async (browser: Browser, url: string) => {
  const page = await configurePage(await browser.newPage());
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    const menuLinks = await page.$$eval('a[href*="longmenu.aspx"]', (anchors) =>
      anchors.map((a) => a.href)
    );

    const menuLimit = pLimit(3);
    const menus = await Promise.all(
      menuLinks.map((link) =>
        menuLimit(async () => {
          const menuPage = await configurePage(await browser.newPage());
          try {
            await menuPage.goto(link, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
            });

            await menuPage.waitForSelector(".longmenugridheader", {
              timeout: 10000,
            });

            const [category, baseMenu] = await Promise.all([
              menuPage
                .$eval(
                  "a:has(div.longmenugridheader)",
                  (div) =>
                    div.textContent
                      ?.split("Menu")[0]
                      .replace(/ /g, "")
                      .trim() || ""
                )
                .catch(() => "Unknown"),
              menuPage.evaluate(parseMenuStructure),
            ]);

            // Scrape nutrition info for all foods in parallel
            const nutritionLimit = pLimit(NUTRITION_CONCURRENCY);
            const foodsWithNutrition = await Promise.all(
              baseMenu.flatMap((section) =>
                section.foods.map(async (food) => {
                  if (!food.link) return food;

                  const nutrition = await nutritionLimit(() =>
                    scrapeNutritionInfo(browser, food.link)
                  );

                  return { ...food, nutrition };
                })
              )
            );

            // Rebuild menu structure with nutrition data and remove duplicate items
            const enhancedMenu = baseMenu.map((section) => {
              const seenFoodNames = new Set();
              const uniqueFoods = section.foods
                .map((food) => {
                  const foodWithNutrition = foodsWithNutrition.find(
                    (f) =>
                      section.foods.some((sf) => sf.name === f.name) &&
                      f.name === food.name
                  );
                  return foodWithNutrition || food; // Use original food if nutrition not found (shouldn't happen normally after previous Promise.all, but for safety)
                })
                .filter((food) => {
                  if (seenFoodNames.has(food.name)) {
                    return false; // Skip duplicate
                  }
                  seenFoodNames.add(food.name);
                  return true; // Keep unique item
                });

              return {
                ...section,
                foods: uniqueFoods.map((f) => ({ ...f })), // map again to ensure immutability if needed elsewhere
              };
            });

            return { type: category, menuCategories: enhancedMenu };
          } catch (error) {
            console.error(`Error processing menu: ${link}`);
            return null;
          } finally {
            await menuPage.close();
          }
        })
      )
    );

    const locationName = new URL(url).searchParams.get("locationName")!.trim();
    const filteredMenus = menus.filter((m) => m !== null);

    await page.close();

    return {
      locationName,
      menus: filteredMenus,
    };
  } catch (error) {
    console.error(`Error processing ${url}:`, error);
    await page.close();
    return null;
  }
};

const parseMenuStructure = (): Section[] => {
  try {
    const sectionMap = new Map<string, Section>();
    let currentSection: Section | null = null;

    document.querySelectorAll("tbody tr").forEach((row) => {
      const categoryHeader = row.querySelector(".longmenucolmenucat");
      //Get the category Name
      if (categoryHeader) {
        const categoryName =
          categoryHeader.textContent?.replace(/^--\s*|[\s-]*$/g, "").trim() ||
          "Uncategorized";

        currentSection = sectionMap.get(categoryName) || {
          categoryName,
          foods: [],
        };
        sectionMap.set(categoryName, currentSection);
      } else if (currentSection) {
        //If it is not a category header AND it's within a category
        const foodLink = row.querySelector(".longmenucoldispname a");
        const foodCheckBox = row.querySelector(
          ".longmenucoldispname input[type='checkbox']"
        );

        // If a food link and checkbox are present, process the food item
        if (foodLink && foodCheckBox) {
          const foodName = foodLink.textContent?.trim() || "";

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
            ["halal", false], // Add halal if you have icons for it
          ]);

          // Collect all allergen icons
          const allergenIcons = Array.from(row.querySelectorAll("img"));
          allergenIcons.forEach((img) => {
            const imgSrc = (img as HTMLImageElement).src;

            // Extract filename from src and normalize it. File names are usually in the format "LegendImages/<allergen_name>.png"
            const filename = imgSrc
              .substring(imgSrc.lastIndexOf("/") + 1)
              .replace(".png", "")
              .toLowerCase()
              .replace(/ /g, "_");

            // Map image filenames to allergen keys
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
          // Add new food item
          if (existingIndex === -1) {
            currentSection.foods.push({
              name: foodName,
              link: (foodLink as HTMLAnchorElement).href,
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

(async () => {
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    defaultViewport: null,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  console.log("Starting menu scraping...");

  try {
    const initialPage = await configurePage(await browser.newPage());
    const menuUrls = await initialPage
      .goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 15000 })
      .then(() =>
        initialPage.$$eval('a[href*="shortmenu.aspx"]', (anchors) =>
          anchors.map((a) => a.href)
        )
      );
    await initialPage.close();

    const scraperLimit = pLimit(MENU_CONCURRENCY); // Main concurrency control
    const rawData = await Promise.all(
      menuUrls.map((url) => scraperLimit(() => scrapeMenuData(browser, url)))
    );

    console.log("Scraping complete.");

    const data = rawData.map(
      (item) => item && JSON.parse(JSON.stringify(item))
    );

    console.log("Inserting into Supabase...");

    const { data: supabaseData, error } = await supabase.rpc(
      "insert_multiple_locations_and_menus",
      {
        arg_data_array: data,
      }
    );

    if (error) {
      console.error("Error inserting data:", error);
    } else {
      console.log("Data inserted successfully:", supabaseData);
    }
  } finally {
    await browser.close();
  }
})();
