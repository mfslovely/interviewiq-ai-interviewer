import { NextResponse } from "next/server";
import { findQuestion } from "@/lib/question-banks";
import { reviewSchema, submissionSchema } from "./review";
import { verifyQuestion } from "@/lib/generated-question";
import { SCORING_PROMPT } from "@/lib/interview-prompts";
import { componentSchema, weightedScore } from "@/lib/scoring";

export async function POST(request: Request) {
  let raw: unknown;
  try { const text = await request.text(); if (text.length > 80000) return NextResponse.json({ error: "Submission too large" }, { status: 413 }); raw = JSON.parse(text); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  const body = parsed.data;
  const generated = body.question.token ? verifyQuestion(body.question.token) : null;
  if (body.question.token && (!generated || generated.question.id !== body.question.id || generated.level !== body.level)) return NextResponse.json({error:"Question expired or invalid. Start another interview."},{status:400});
  const question = generated?.question || findQuestion(body.question.id);
  if (!question || (!body.answer.trim() && !body.code?.trim())) return NextResponse.json({ error: "A known question and an answer are required" }, { status: 400 });
  if (question.coding && !body.followUp && (!body.code?.trim() || body.code === question.coding.starter)) return NextResponse.json({ error: "Write your solution first" }, { status: 400 });
  const demo = (reason: string) => ({ score: null, verdict: reason, strengths: ["Your submission was received.", "Compare your approach with the reference below."], improvements: ["No correctness or performance score is assigned in demo mode.", "Enable Groq for individual feedback on your reasoning and code."], betterAnswer: body.followUp ? "Discuss the follow-up using a concrete example, explain each step, and relate it to your original approach. AI review is unavailable in demo mode." : question.idealAnswer, followUp: question.followUp, source: "demo" });
  if (!process.env.GROQ_API_KEY) return NextResponse.json(demo("Practice received — AI review is not configured"));
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(25000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-20b", temperature: 0.25, max_completion_tokens: 1800, response_format: { type: "json_object" }, messages: [
        { role: "system", content: SCORING_PROMPT },
        { role: "user", content: JSON.stringify({ role: generated?.topic || body.track, level: body.level, question: question.prompt, reference: question.idealAnswer, expectedConcepts: question.signals, coding: question.coding, candidateAnswer: body.answer, candidateCode: body.code, followUpQuestion: body.followUp, previousAnswer: body.previousAnswer }) }
      ] })
    });
    if (!response.ok) throw new Error("Provider unavailable");
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const output = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    const components = componentSchema.parse(output.components);
    const score = weightedScore(components);
    const review = reviewSchema.parse({...output,score});
    return NextResponse.json({ ...review, components, source: "groq" });
  } catch { return NextResponse.json(demo("AI review is unavailable — reference practice only")); }
}
