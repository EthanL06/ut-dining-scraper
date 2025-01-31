import puppeteer, { Page } from "puppeteer";
import { writeFile } from "fs/promises";
import { join } from "path";

interface Section {
  sectionName: string;
  foods: Food[];
}

interface Food {
  name: string;
  link: string;
  allergens: string[];
}

const URL = "https://hf-foodpro.austin.utexas.edu/foodpro/location.aspx";

const scrapeMenus = async (url: string, page: Page) => {
  const locationName = url.split("locationName=")[1].split("&")[0];
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60 * 1000 });

  // Get all the a tags and filter the ones with the src that includes "longmenu.aspx"
  const a = await page.evaluate(() => {
    const aTags = Array.from(document.querySelectorAll("a"));
    return aTags
      .filter((a) => a.href.includes("longmenu.aspx"))
      .map((a) => a.href);
  });

  // Menus include breakfast, lunch, and dinner
  const menus = [];

  for (const link of a) {
    await page.goto(link, { waitUntil: "networkidle2", timeout: 60 * 1000 });

    // Breakfast, lunch, or dinner category
    const category = await page.evaluate(() => {
      const div = document.querySelector("a:has(div.longmenugridheader)");
      const text = div?.textContent?.trim() || "";
      return text
        .split("Menu")[0]
        .replace(/&nbsp;/g, "")
        .trim(); // Returns "Breakfast", "Lunch", or "Dinner"
    });

    const menu = await page.evaluate(() => {
      const categories: Section[] = [];
      const categoryMap = new Map<string, Section>();
      const rows = document.querySelectorAll("tbody tr");

      let currentCategory: Section | null = null;
      const sectionNameRegex = /^--\s*|\s*--$/g;
      const allergenAltRegex = / Icon$/;

      for (const row of rows) {
        const categoryHeader = row.querySelector(
          ".longmenucolmenucat"
        ) as HTMLElement;
        const foodLink = row.querySelector(
          ".longmenucoldispname a"
        ) as HTMLAnchorElement;

        if (categoryHeader) {
          const sectionName = categoryHeader
            .textContent!.trim()
            .replace(sectionNameRegex, "")
            .trim();

          currentCategory = categoryMap.get(sectionName) || null;

          if (!currentCategory) {
            currentCategory = {
              sectionName,
              foods: [],
            };
            categoryMap.set(sectionName, currentCategory);
            categories.push(currentCategory);
          }
        } else if (foodLink && currentCategory) {
          const foodName = foodLink.textContent!.trim();

          if (!currentCategory.foods.some((food) => food.name === foodName)) {
            const allergens = row.querySelectorAll("img");
            currentCategory.foods.push({
              name: foodName,
              link: foodLink.href,
              allergens: Array.from(allergens, (img) =>
                (img as HTMLImageElement).alt
                  .replace(allergenAltRegex, "")
                  .trim()
              ),
            });
          }
        }
      }

      return categories;
    });

    menus.push({
      type: category,
      menu,
    });
  }

  // Output the data to a JSON file
  await writeFile(
    join(__dirname, "..", "data", `${locationName}.json`),
    JSON.stringify(menus, null, 2)
  );
};

const scrapeMenuUrls = async (page: Page) => {
  // Grab all the a tags that includes "shortmenu.aspx" in the href
  return await page.evaluate(() => {
    const aTags = Array.from(document.querySelectorAll("a"));
    return aTags
      .filter((a) => a.href.includes("shortmenu.aspx"))
      .map((a) => a.href);
  });
};

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1280,
      height: 800,
    },
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60 * 1000 });

  const urls = await scrapeMenuUrls(page);

  for (const url of urls) {
    try {
      await scrapeMenus(url, page);
    } catch (error) {
      console.error(error);
    }
  }

  console.log("Done scraping menus!");
  await browser.close();
})();
