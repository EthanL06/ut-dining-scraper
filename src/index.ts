import puppeteer from "puppeteer";
import { writeFile } from "fs/promises";
import { join } from "path";
import { Menu, MenuItem } from "./types/Menu";

const URL =
  "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12(a)&locationName=JCL+Dining&naFlag=1";

(async () => {
  console.log("Starting Puppeteer!");
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

  await page.goto(URL);

  await page.waitForSelector(".shortmenuinstructs + table");

  const menuData = await page.evaluate(() => {
    const menuCategories: Menu = [];
    const categoryElements = document.querySelectorAll(".shortmenucats");

    categoryElements.forEach((categoryElement) => {
      const categoryTitle = (categoryElement.textContent?.trim() || "")
        .replace(/^-- /, "") // Remove leading "--"
        .replace(/ --$/, "") // Remove trailing "--"
        .trim(); // Remove any remaining whitespace

      const menuItems: MenuItem[] = [];
      let nextElement =
        categoryElement.parentElement?.parentElement?.nextElementSibling;

      while (nextElement && !nextElement.querySelector(".shortmenucats")) {
        const itemElement = nextElement.querySelector(".shortmenurecipes");
        if (itemElement) {
          const name = itemElement.textContent?.trim() || "";
          const tags = Array.from(nextElement.querySelectorAll("img"))
            .map((img) => img.getAttribute("alt") || "")
            .map((alt) => alt.replace(/ Icon$/, "")) // Remove " Icon" suffix
            .filter((alt) => alt.trim() !== "");

          menuItems.push({ name, tags });
        }
        nextElement = nextElement.nextElementSibling;
      }

      menuCategories.push({ [categoryTitle]: [menuItems] });
    });

    return menuCategories;
  });

  // output this to a json file in the data folder
  const outputPath = join(process.cwd(), "data", "menu.json");

  try {
    // Create formatted JSON string
    const jsonData = JSON.stringify(menuData, null, 2);

    // Write the file asynchronously
    await writeFile(outputPath, jsonData, "utf8");
    console.log(`Data successfully written to ${outputPath}`);
  } catch (error) {
    console.error("Error writing data to file:", error);
  }

  //   await browser.close();
})();
