import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TABS, TAB_PROPS, ALWAYS_LOADED } from "./tabData";

// /admin loads each prop only for the tabs that list it in TAB_PROPS. A component reading a prop the
// page didn't load gets undefined — forms show defaults and a save overwrites the real value. These
// checks fail the moment a tab/header and TAB_PROPS drift apart.
const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const propsOf = (src: string, fn: string) => {
  const m = src.match(new RegExp(`export function ${fn}\\(\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}: PlatformConsoleProps\\)`));
  if (!m) throw new Error(`couldn't parse props of ${fn}`);
  return names(m[1]);
};
// "a = [], b = { x: 1, y: 2 }, c: alias" → ["a", "b", "c"]
const names = (list: string) => list.replace(/\{[^}]*\}/g, "{}").split(",").map((p) => p.trim().split(/[\s=:]/)[0]).filter(Boolean);

const shell = read("../PlatformConsole.tsx");
const tabComponent = Object.fromEntries([...shell.matchAll(/tab === "(\w+)" && <(\w+) /g)].map((m) => [m[1], m[2]]));

describe("admin tab data wiring", () => {
  it("renders a component for every tab", () => {
    expect(Object.keys(tabComponent).sort()).toEqual([...TABS].sort());
  });

  it.each(TABS)("%s reads exactly the props TAB_PROPS loads for it", (tab) => {
    const used = propsOf(read(`${tabComponent[tab]}.tsx`), tabComponent[tab]).filter((p) => !ALWAYS_LOADED.includes(p as never));
    expect(used.sort()).toEqual([...TAB_PROPS[tab]].sort());
  });

  it("the header only reads props loaded on every tab", () => {
    const m = shell.match(/const \{([^}]*(?:\{[^}]*\}[^}]*)*)\} = props;/);
    const used = names(m![1]);
    expect(used.filter((p) => !ALWAYS_LOADED.includes(p as never))).toEqual([]);
  });

  it("page.tsx loads every per-tab prop through needs()", () => {
    const page = readFileSync(join(__dirname, "../../../app/(dashboard)/admin/page.tsx"), "utf8");
    for (const prop of new Set(Object.values(TAB_PROPS).flat())) expect(page).toContain(`needs("${prop}")`);
    expect(page).not.toMatch(/\bon\(/); // no hand-maintained tab lists
  });
});
