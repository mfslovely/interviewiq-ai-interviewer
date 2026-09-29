import { z } from "zod";
export const submissionSchema = z.object({
  track: z.string().max(100), level: z.enum(["Junior", "Mid-level", "Senior"]),
  question: z.object({ id: z.string().max(80), token: z.string().max(40000).optional() }),
  answer: z.string().max(12000).default(""), code: z.string().max(20000).optional(),
  followUp: z.string().max(2000).optional(), previousAnswer: z.string().max(12000).optional()
});
export const reviewSchema = z.object({ score: z.number().int().min(0).max(100), verdict: z.string().min(1).max(600), strengths: z.array(z.string().max(1000)).length(2), improvements: z.array(z.string().max(1000)).length(2), betterAnswer: z.string().min(1).max(6000), followUp: z.string().min(1).max(2000) });
