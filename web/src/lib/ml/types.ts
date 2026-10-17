export type Matrix = number[][];

export interface TabularData {
  features: string[];
  classes: string[];
  X: Matrix;
  y: number[];
}

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export type StepType = "standard" | "minmax" | "robust" | "log" | "clip" | "poly" | "pca" | "bins";
export type ModelType = "logreg" | "knn" | "tree" | "forest" | "gnb" | "mlp";

export interface StepSpec {
  id: string;
  type: StepType;
  params: Params;
  enabled: boolean;
}

export interface ModelSpec {
  type: ModelType;
  params: Params;
}

export interface ValidationSpec {
  mode: "holdout" | "cv";
  testSize: number;
  folds: number;
  stratify: boolean;
  seed: number;
}

export interface LabConfig {
  features: string[];
  steps: StepSpec[];
  model: ModelSpec;
  validation: ValidationSpec;
}

export interface ColumnSummary {
  name: string;
  min: number;
  max: number;
  mean: number;
  std: number;
  hist: number[];
}

export interface StageSummary {
  stepId: string | null;
  label: string;
  rows: number;
  cols: number;
  columns: ColumnSummary[];
  info?: string;
}

export interface HistoryPoint {
  step: number;
  loss?: number;
  trainAcc?: number;
  valAcc?: number;
}

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface EvalMetrics {
  accuracy: number;
  top3: number;
  macroF1: number;
  confusion: number[][];
  perClass: ClassMetrics[];
}

export interface RunResult {
  config: LabConfig;
  trainAcc: number;
  testAcc: number;
  macroF1: number;
  top3: number;
  cvScores?: number[];
  confusion: number[][];
  perClass: ClassMetrics[];
  history: HistoryPoint[];
  historyKind: "epoch" | "trees" | null;
  importances?: { name: string; value: number }[];
  stages: StageSummary[];
  modelInfo: string;
  nTrain: number;
  nTest: number;
  durationMs: number;
  modelVersion: number;
}

export interface TrainProgress {
  fraction: number;
  label?: string;
  history?: HistoryPoint[];
}
