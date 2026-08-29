export type MenuAction =
  | { type: "command"; args: string[] }
  | { type: "command-with-input"; args: string[]; inputLabel: string; inputFlag: string };

export interface MenuItem {
  name: string;
  value: string;
  action?: MenuAction;
}

export interface MenuGroup {
  id: string;
  label: string;
  action?: MenuAction;
  items?: MenuItem[];
}
