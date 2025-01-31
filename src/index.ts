import puppeteer, { Browser, Page } from "puppeteer";
import { writeFile } from "fs/promises";
import { join } from "path";
import pLimit from "p-limit";
import { mkdirSync, existsSync } from "fs";

interface Section {
  sectionName: string;
  foods: Food[];
}

interface Food {
  name: string;
  link: string;
  allergens: string[];
}

const BASE_URL = "https://hf-foodpro.austin.utexas.edu/foodpro/location.aspx";
const HEADLESS = false;
const DATA_DIR = join(__dirname, "..", "data");

// Pre-create data directory
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

const scrapeMenuData = async (browser: Browser, url: string) => {
  const page = await configurePage(await browser.newPage());
  try {
    const navigationResult = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Validate successful navigation
    if (!navigationResult?.ok()) {
      console.warn(`Failed to load ${url}: HTTP ${navigationResult?.status()}`);
      return;
    }

    const menuLinks = await page.$$eval('a[href*="longmenu.aspx"]', (anchors) =>
      anchors.map((a) => a.href)
    );

    // Handle empty menu case
    if (menuLinks.length === 0) {
      console.warn(`No menu links found for ${url}`);
      return;
    }

    const menuLimit = pLimit(3);
    const menus = await Promise.all(
      menuLinks.map((link) =>
        menuLimit(async () => {
          const menuPage = await configurePage(await browser.newPage());
          try {
            const menuNav = await menuPage.goto(link, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
            });

            if (!menuNav?.ok()) {
              console.warn(`Failed to load menu ${link}`);
              return null;
            }

            // Validate page structure
            const hasContent = await menuPage
              .waitForSelector(".longmenugridheader", {
                timeout: 500, // Change this value as needed
              })
              .then(() => true)
              .catch(() => false);

            if (!hasContent) {
              console.warn(`No menu content found in ${link}`);
              return null;
            }

            const [category, menu] = await Promise.all([
              menuPage
                .$eval(
                  "a:has(div.longmenugridheader)",
                  (div) =>
                    div.textContent
                      ?.split("Menu")[0]
                      .replace(/&nbsp;/g, "")
                      .trim() || "Unknown"
                )
                .catch(() => "Unknown"),
              menuPage.evaluate(parseMenuStructure).catch(() => []),
            ]);

            return menu.length > 0 ? { type: category, menu } : null;
          } finally {
            await menuPage.close();
          }
        })
      )
    );

    // Filter out invalid menus
    const validMenus = menus.flat().filter(Boolean);

    if (validMenus.length === 0) {
      console.warn(`No valid menus found for ${url}`);
      return;
    }

    const locationName = new URL(url).searchParams.get("locationName");
    if (!locationName) {
      console.warn(`Missing location name in URL: ${url}`);
      return;
    }

    await writeFile(
      join(DATA_DIR, `${locationName}.json`),
      JSON.stringify(validMenus, null, 2)
    );
  } catch (error) {
    console.error(`Error processing ${url}:`, error);
  } finally {
    await page.close();
  }
};

const parseMenuStructure = (): Section[] => {
  try {
    const sectionMap = new Map<string, Section>();
    let currentSection: Section | null = null;

    document.querySelectorAll("tbody tr").forEach((row) => {
      const categoryHeader = row.querySelector(".longmenucolmenucat");
      if (categoryHeader) {
        const sectionName =
          categoryHeader.textContent?.replace(/^--|--$/g, "").trim() ||
          "Uncategorized";
        currentSection = { sectionName, foods: [] };
        sectionMap.set(sectionName, currentSection);
      } else if (currentSection) {
        const foodLink = row.querySelector(".longmenucoldispname a");
        if (foodLink) {
          const existingFoods = new Set(
            currentSection.foods.map((f) => f.name)
          );
          const foodName = foodLink.textContent?.trim() || "";

          if (foodName && !existingFoods.has(foodName)) {
            currentSection.foods.push({
              name: foodName,
              link: (foodLink as HTMLAnchorElement).href,
              allergens: Array.from(row.querySelectorAll("img"), (img) =>
                (img as HTMLImageElement).alt.replace(/ Icon$/, "").trim()
              ),
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

    const scraperLimit = pLimit(7); // Main concurrency control
    await Promise.all(
      menuUrls.map((url) => scraperLimit(() => scrapeMenuData(browser, url)))
    );
  } finally {
    await browser.close();
  }
  console.log("All menus scraped successfully!");
})();
