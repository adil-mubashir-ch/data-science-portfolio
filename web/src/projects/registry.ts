import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { meta as cropMeta } from "./predictive_modeling_for_agriculture/meta";

export interface ProjectMeta {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  date: string;
  cover?: string;
  highlights: { label: string; value: string }[];
}

export interface ProjectEntry {
  meta: ProjectMeta;
  Page: LazyExoticComponent<ComponentType>;
}

/** Every project on the site. Adding an entry here adds it to the home page and routing. */
export const projects: ProjectEntry[] = [
  { meta: cropMeta, Page: lazy(() => import("./predictive_modeling_for_agriculture")) },
];
