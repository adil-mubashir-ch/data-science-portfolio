import type { ProjectMeta } from "../registry";

export const meta: ProjectMeta = {
  slug: "predictive_modeling_for_agriculture",
  title: "Sowing Success: Crop Recommendation Lab",
  summary:
    "Which crop suits a field, given only four cheap soil tests? Explore 2,200 fields, build ML pipelines visually, tune hyperparameters live, and see where each model draws its boundaries.",
  tags: ["Classification", "Interactive ML lab", "Feature selection", "scikit-learn"],
  date: "2026-10",
  cover: "/data/predictive_modeling_for_agriculture/cover.jpg",
  highlights: [
    { label: "Crops", value: "22" },
    { label: "Models", value: "6" },
    { label: "Best accuracy", value: "≈81%" },
  ],
};
