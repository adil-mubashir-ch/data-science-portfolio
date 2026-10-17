export type Family = "Cereals" | "Pulses" | "Fruits" | "Cash crops";

interface CropInfo {
  color: string;
  family: Family;
  emoji?: string;
  label: string;
}

export const CROPS: Record<string, CropInfo> = {
  apple: { color: "#c8102e", family: "Fruits", emoji: "🍎", label: "Apple" },
  banana: { color: "#e4d00a", family: "Fruits", emoji: "🍌", label: "Banana" },
  blackgram: { color: "#4a6741", family: "Pulses", label: "Black gram" },
  chickpea: { color: "#c2b280", family: "Pulses", label: "Chickpea" },
  coconut: { color: "#8b6b4a", family: "Fruits", emoji: "🥥", label: "Coconut" },
  coffee: { color: "#7a2e12", family: "Cash crops", emoji: "☕", label: "Coffee" },
  cotton: { color: "#a3a8d9", family: "Cash crops", label: "Cotton" },
  grapes: { color: "#7b4f9e", family: "Fruits", emoji: "🍇", label: "Grapes" },
  jute: { color: "#8a8a80", family: "Cash crops", label: "Jute" },
  kidneybeans: { color: "#e25822", family: "Pulses", label: "Kidney beans" },
  lentil: { color: "#2a9d8f", family: "Pulses", label: "Lentil" },
  maize: { color: "#e69f00", family: "Cereals", emoji: "🌽", label: "Maize" },
  mango: { color: "#ffc857", family: "Fruits", emoji: "🥭", label: "Mango" },
  mothbeans: { color: "#604e97", family: "Pulses", label: "Moth beans" },
  mungbean: { color: "#8db600", family: "Pulses", label: "Mung bean" },
  muskmelon: { color: "#f99379", family: "Fruits", emoji: "🍈", label: "Muskmelon" },
  orange: { color: "#f38400", family: "Fruits", emoji: "🍊", label: "Orange" },
  papaya: { color: "#e68fac", family: "Fruits", label: "Papaya" },
  pigeonpeas: { color: "#0067a5", family: "Pulses", label: "Pigeon peas" },
  pomegranate: { color: "#b3446c", family: "Fruits", label: "Pomegranate" },
  rice: { color: "#56b4e9", family: "Cereals", emoji: "🌾", label: "Rice" },
  watermelon: { color: "#3bb273", family: "Fruits", emoji: "🍉", label: "Watermelon" },
};

export const FAMILIES: Family[] = ["Cereals", "Pulses", "Fruits", "Cash crops"];

export const FEATURES: Record<string, { label: string; short: string; unit: string; blurb: string }> = {
  N: { label: "Nitrogen", short: "N", unit: "ratio", blurb: "Drives leafy growth. Highest for cotton, coffee, banana and melons." },
  P: { label: "Phosphorus", short: "P", unit: "ratio", blurb: "Roots and flowering. Extremely high for apples and grapes." },
  K: { label: "Potassium", short: "K", unit: "ratio", blurb: "Fruit quality and water regulation. The most informative single test here." },
  ph: { label: "pH", short: "pH", unit: "", blurb: "Acidity. Most fields sit between 5.5 and 7.5; chickpea fields are the most alkaline." },
};

export const cropLabel = (c: string) => CROPS[c]?.label ?? c;
export const cropColor = (c: string) => CROPS[c]?.color ?? "#888";
export const featureLabel = (f: string) => FEATURES[f]?.label ?? f;
