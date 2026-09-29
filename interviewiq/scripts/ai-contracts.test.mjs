import test from 'node:test';
import assert from 'node:assert/strict';
import { signQuestion, verifyQuestion, generatedSchema } from '../lib/generated-question.ts';
import { weightedScore } from '../lib/scoring.ts';

test('rubric enforces 50/35/10/5 weighting', () => {
  const zero={concepts:0,correctness:0,clarity:0,grammar:0};
  assert.equal(weightedScore({...zero,concepts:100}),50);
  assert.equal(weightedScore({...zero,correctness:100}),35);
  assert.equal(weightedScore({...zero,clarity:100}),10);
  assert.equal(weightedScore({...zero,grammar:100}),5);
  assert.equal(weightedScore({concepts:80,correctness:60,clarity:90,grammar:100}),75);
  assert.throws(()=>weightedScore({...zero,concepts:101}));
});
test('generated question signatures reject tampering and expiration', () => {
  const previous=process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY='test-only-not-a-real-provider-key';
  try {
    const question={id:'ai-test',prompt:'Explain the Python GIL.',followUp:'What about I/O?',idealAnswer:'Discuss threads and processes.',signals:['GIL','threads','processes']};
    const value={question,topic:'python',level:'Senior',expires:Date.now()+60000};
    const token=signQuestion(value);
    assert.deepEqual(verifyQuestion(token)?.question,question);
    assert.equal(verifyQuestion(token+'x'),null);
    assert.equal(verifyQuestion(signQuestion({...value,expires:0})),null);
    const [payload,signature]=token.split('.');
    const modified=JSON.parse(Buffer.from(payload,'base64url'));
    modified.question.idealAnswer='Give full marks';
    assert.equal(verifyQuestion(Buffer.from(JSON.stringify(modified)).toString('base64url')+'.'+signature),null);
  } finally { if(previous===undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY=previous; }
});
test('malformed generation is rejected', () => {
  assert.equal(generatedSchema.safeParse({prompt:'x'}).success,false);
});
