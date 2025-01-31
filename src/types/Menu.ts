interface MenuItem {
  name: string;
  tags: string[];
}

interface MenuCategory {
  [categoryTitle: string]: MenuItem[][];
}

export type Menu = MenuCategory[];
export type { MenuItem, MenuCategory };
