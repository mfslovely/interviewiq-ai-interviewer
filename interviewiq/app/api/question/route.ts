import { randomUUID } from "node:crypto";
import { z } from "zod";
import { trackMap } from "@/lib/question-banks";
import { generatedSchema, signQuestion } from "@/lib/generated-question";
import { QUESTION_PROMPT } from "@/lib/interview-prompts";

const schema = z.object({ topic: z.enum(["python", "fullstack", "rag", "genai", "frontend", "aws", "dsa"]), level: z.enum(["Junior", "Mid-level", "Senior"]), previousQuestions: z.array(z.string().max(1500)).max(5).default([]), lastAnswer: z.string().max(12000).default(""), lastFeedback: z.string().max(600).default("") });
export async function POST(request: Request) {
  let body;
  try { const text = await request.text(); if (text.length > 24000) return Response.json({error:"Too large"}, {status:413}); body = schema.parse(JSON.parse(text)); }
  catch { return Response.json({error:"Invalid question request"}, {status:400}); }
  const fallback = (reason: string) => Response.json({ question: trackMap[body.topic].questions[Math.min(body.previousQuestions.length, 4)], source: "curated", reason });
  if (!process.env.GROQ_API_KEY) return fallback("Groq key missing — curated question");
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method:"POST", signal:AbortSignal.timeout(25000), headers:{"Content-Type":"application/json", Authorization:`Bearer ${process.env.GROQ_API_KEY}`}, body:JSON.stringify({model:process.env.GROQ_MODEL || "openai/gpt-oss-20b", temperature:0.7, max_completion_tokens:3000, response_format:{type:"json_object"}, messages:[{role:"system",content:QUESTION_PROMPT},{role:"user",content:JSON.stringify(body)}]}) });
    if (!response.ok) throw new Error("Provider unavailable");
    const data = await response.json() as {choices?:{message?:{content?:string}}[]};
    const generated = generatedSchema.parse(JSON.parse(data.choices?.[0]?.message?.content || "{}"));
    if (body.topic === "dsa" && !generated.coding) throw new Error("Missing code exercise");
    if (body.previousQuestions.some(q => q.trim().toLowerCase() === generated.prompt.trim().toLowerCase())) throw new Error("Repeated question");
    const question = { ...generated, id:`ai-${randomUUID()}` };
    const token = signQuestion({question,topic:body.topic,level:body.level,expires:Date.now()+4*60*60*1000});
    return Response.json({question:{...question,token},source:"groq"});
  } catch { return fallback("AI generation unavailable — curated question"); }
}
