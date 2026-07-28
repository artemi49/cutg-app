export type Language = "de" | "en" | "fr" | "es" | "it";

/** Zielgruppe der Style-Bibliothek */
export type Gender = "men" | "women";

/** "cut" = Schnitt/Styling (Default), "color" = reine Farbveränderung */
export type StyleKind = "cut" | "color";

export interface HairStyle {
  name: string;
  details: string;
  kind?: StyleKind;
}

export interface HairstyleGroup {
  group: string;
  cuts: HairStyle[];
}

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
