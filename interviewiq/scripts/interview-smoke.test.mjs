import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const input = { track: 'DSA & Coding', level: 'Mid-level', question: { id: 'dsa-1' }, answer: 'Use a dictionary for complements.', code: 'def two_sum(nums, target):\n    return []' };
const post = (body) => fetch(`${base}/api/interview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const endpoint = (path,body) => fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('invalid generation topic rejected',async()=>assert.equal((await endpoint('question',{topic:'unknown',level:'Senior'})).status,400));
test('question generation returns a usable question or labelled fallback',async()=>{
  const response=await endpoint('question',{topic:'dsa',level:'Senior',previousQuestions:[]});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.ok(data.question.prompt && data.question.coding.starter);
  assert.ok(['groq','curated'].includes(data.source));
  if(data.source==='groq') assert.ok(data.question.token); else assert.ok(data.reason);
});
test('invalid signed question rejected',async()=>assert.equal((await post({...input,question:{id:'ai-invalid',token:'bad.signature'}})).status,400));
test('speech rejects oversized chunks',async()=>assert.equal((await endpoint('speech',{text:'a'.repeat(201)})).status,400));
test('speech rejects empty text',async()=>assert.equal((await endpoint('speech',{text:''})).status,400));

test('health is available', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});
test('invalid JSON is rejected', async () => assert.equal((await post('{')).status, 400));
test('unknown question is rejected', async () => assert.equal((await post({ ...input, question: { id: 'unknown' } })).status, 400));
test('coding requires a solution', async () => assert.equal((await post({ ...input, code: '' })).status, 400));
test('unchanged starter is rejected', async () => {
  const code = 'def two_sum(nums: list[int], target: int) -> list[int]:\n    # Return two distinct indices, or []\n    pass\n';
  assert.equal((await post({ ...input, code })).status, 400);
});
test('oversized submission is rejected', async () => assert.equal((await post('x'.repeat(80001))).status, 413));
test('solution review has an honest source and score', async () => {
  const response = await post(input);
  assert.equal(response.status, 200);
  const review = await response.json();
  assert.ok(['demo', 'groq'].includes(review.source));
  if (review.source === 'demo') assert.equal(review.score, null);
  else assert.ok(Number.isInteger(review.score) && review.score >= 0 && review.score <= 100);
  assert.equal(review.strengths.length, 2);
  assert.equal(review.improvements.length, 2);
  assert.ok(review.followUp && review.betterAnswer);
});
test('follow-up reply can be reviewed', async () => {
  const response = await post({ ...input, followUp: 'Why check first?', previousAnswer: input.answer, answer: 'To avoid using the same index twice.' });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).betterAnswer);
});
