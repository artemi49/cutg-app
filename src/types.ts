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
}
