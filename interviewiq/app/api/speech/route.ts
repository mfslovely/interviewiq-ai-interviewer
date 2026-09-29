import { z } from "zod";
const schema = z.object({ text:z.string().trim().min(1).max(200) });
export async function POST(request: Request) {
  let body;
  try { const text = await request.text(); if(text.length > 2000) return Response.json({error:"Too large"},{status:413}); body = schema.parse(JSON.parse(text)); }
  catch { return Response.json({error:"Speech text must be 1–200 characters"},{status:400}); }
  if (!process.env.GROQ_API_KEY) return Response.json({error:"Neural voice requires GROQ_API_KEY"},{status:503});
  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {method:"POST",signal:AbortSignal.timeout(20000),headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:"canopylabs/orpheus-v1-english",voice:process.env.GROQ_TTS_VOICE || "hannah",input:body.text,response_format:"wav"})});
    if (!response.ok) throw new Error("TTS unavailable");
    return new Response(await response.arrayBuffer(),{headers:{"Content-Type":"audio/wav","Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Neural voice unavailable"},{status:502}); }
}
