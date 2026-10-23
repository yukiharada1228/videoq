import { describe,it,expect } from "vitest";
import { tokenCost } from "../src/lib/inference-cost";
import { embedQuery } from "../src/lib/embeddings";
import { embedding } from "./helpers/embedding";
import { vi } from "vitest";

describe("provider cost and embedding isolation",()=>{
 it("uses billed output including reasoning once, and discounts cached input",()=>{
  for(const [provider,model] of [["groq","openai/gpt-oss-120b"],["openai","gpt-4o-mini"]]) {
   expect(tokenCost(provider,model,{prompt_tokens:1000,completion_tokens:500,prompt_tokens_details:{cached_tokens:200},completion_tokens_details:{reasoning_tokens:300}})).toBeCloseTo(.000435,9);
  }
  expect(tokenCost("groq","openai/gpt-oss-120b",undefined)).toBeNull();
  expect(tokenCost("local","local-chat",{prompt_tokens:1,completion_tokens:1})).toBeNull();
 });
 it("keeps embeddings on the original OpenAI model and key with Groq chat configured",async()=>{
  vi.stubGlobal("fetch",async(url:unknown,init:RequestInit)=>{
   expect(String(url)).toBe("https://api.openai.com/v1/embeddings");
   expect(new Headers(init.headers).get("authorization")).toBe("Bearer openai-secret");
   expect(JSON.parse(String(init.body))).toMatchObject({model:"text-embedding-3-small",dimensions:1536});
   return Response.json({data:[{index:0,embedding:embedding(1)}],usage:{prompt_tokens:5}});
  });
  try{const env={LLM_PROVIDER:"groq",LLM_MODEL:"openai/gpt-oss-120b",GROQ_API_KEY:"groq-secret",OPENAI_API_KEY:"openai-secret"};expect(await embedQuery(env,"Query")).toHaveLength(1536);}
  finally{vi.unstubAllGlobals();}
 });
});
