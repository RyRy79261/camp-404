import { z } from "zod";
import { DietaryTag } from "./member";

export const RecipeStatus = z.enum([
  "pending",
  "analysing",
  "ready",
  "scheduled",
  "rejected",
]);
export type RecipeStatus = z.infer<typeof RecipeStatus>;

export const RecipeSource = z.enum(["url", "text", "voice"]);
export type RecipeSource = z.infer<typeof RecipeSource>;

export const RecipeSubmission = z.object({
  source: RecipeSource,
  url: z.string().url().optional(),
  rawText: z.string().optional(),
  audioBlobUrl: z.string().url().optional(),
  submitterId: z.string().uuid(),
});

export const Ingredient = z.object({
  name: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  aisle: z.string().optional(),
});

export const NormalisedRecipe = z.object({
  title: z.string(),
  servings: z.number().int().positive(),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  dietaryTags: z.array(DietaryTag),
  ingredients: z.array(Ingredient),
  steps: z.array(z.string()),
  complementaryDishes: z.array(z.string()).default([]),
});
export type NormalisedRecipe = z.infer<typeof NormalisedRecipe>;
