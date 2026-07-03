export type Language = "de" | "en" | "fr" | "es" | "it";

export interface BlueprintTexts {
  beforeLabel: string;
  afterLabel: string;
  headline: string;
  subline: string;
  cta: string;
}

export interface BlueprintConfig {
  language: Language;
  texts: BlueprintTexts;
  accentColor: string;
  showBranding: boolean;
  brandName: string;
  /** Optional: Pillen-Farben der beiden Panel-Labels (Default rot/grün) */
  labelColors?: { top: string; bottom: string };
}
