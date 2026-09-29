import { z } from "zod";
const percentage = {type:"integer",minimum:0,maximum:100};
const shortText = {type:"string",minLength:1,maxLength:1000};
export const scoringResponseFormat = {
  type:"json_schema", json_schema:{name:"interview_review",strict:true,schema:{
    type:"object",additionalProperties:false,
    required:["components","verdict","strengths","improvements","betterAnswer","followUp"],
    properties:{
      components:{type:"object",additionalProperties:false,required:["concepts","correctness","clarity","grammar"],properties:{concepts:percentage,correctness:percentage,clarity:percentage,grammar:percentage}},
      verdict:{type:"string",minLength:1,maxLength:600},
      strengths:{type:"array",items:shortText,minItems:2,maxItems:2},
      improvements:{type:"array",items:shortText,minItems:2,maxItems:2},
      betterAnswer:{type:"string",minLength:1,maxLength:6000},
      followUp:{type:"string",minLength:1,maxLength:2000}
    }
  }}
};
export const componentSchema = z.object({concepts:z.number().int().min(0).max(100),correctness:z.number().int().min(0).max(100),clarity:z.number().int().min(0).max(100),grammar:z.number().int().min(0).max(100)});
export function weightedScore(input: unknown) {
  const c = componentSchema.parse(input);
  return Math.round(c.concepts*0.5+c.correctness*0.35+c.clarity*0.1+c.grammar*0.05);
}
