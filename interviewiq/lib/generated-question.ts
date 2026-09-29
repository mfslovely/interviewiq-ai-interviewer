import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const generatedSchema = z.object({
  prompt: z.string().min(10).max(1500), followUp: z.string().min(1).max(1000),
  idealAnswer: z.string().min(1).max(5000), signals: z.array(z.string().max(150)).min(3).max(8),
  coding: z.object({ starter: z.string().max(3000), examples: z.array(z.string().max(500)).min(1).max(5), constraints: z.string().max(1500), solution: z.string().max(6000), complexity: z.string().max(1000) }).optional()
});
const envelope = z.object({ question: generatedSchema.extend({ id: z.string() }), topic: z.string(), level: z.string(), expires: z.number() });
export function signQuestion(value: z.infer<typeof envelope>) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", process.env.GROQ_API_KEY!).update(data).digest("base64url");
  return `${data}.${signature}`;
}
export function verifyQuestion(token: string) {
  try {
    if (!process.env.GROQ_API_KEY) return null;
    const [data, signature, extra] = token.split(".");
    if (extra || !data || !signature) return null;
    const expected = createHmac("sha256", process.env.GROQ_API_KEY).update(data).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = envelope.parse(JSON.parse(Buffer.from(data, "base64url").toString()));
    return value.expires > Date.now() ? value : null;
  } catch { return null; }
}
