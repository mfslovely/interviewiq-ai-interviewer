import { z } from "zod";
export const componentSchema = z.object({concepts:z.number().int().min(0).max(100),correctness:z.number().int().min(0).max(100),clarity:z.number().int().min(0).max(100),grammar:z.number().int().min(0).max(100)});
export function weightedScore(input: unknown) {
  const c = componentSchema.parse(input);
  return Math.round(c.concepts*0.5+c.correctness*0.35+c.clarity*0.1+c.grammar*0.05);
}
