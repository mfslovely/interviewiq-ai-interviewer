export type TrackId = "python" | "fullstack" | "rag" | "genai" | "frontend" | "aws" | "dsa";

export type Difficulty = "Junior" | "Mid-level" | "Senior";

export type InterviewQuestion = {
  id: string;
  prompt: string;
  followUp: string;
  idealAnswer: string;
  signals: string[];
  coding?: { starter: string; examples: string[]; constraints: string; solution: string; complexity: string };
};

export type Track = {
  id: TrackId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  questions: InterviewQuestion[];
};
