import type { CanonicalDay } from "../../json/index.js";

export function renderCaloriesSection(day: CanonicalDay): string | null {
  const c = day.calories;
  if (!c || typeof c.total !== "number") return null;
  return ["## 🔥 Calories", `- **Total**: ${c.total} kcal`].join("\n");
}
