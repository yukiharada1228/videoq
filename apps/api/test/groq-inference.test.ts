import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { createChatModel } from "../src/lib/chat-model";
import { resolveLlmRoute, isTransientInferenceError } from "../src/lib/inference-provider";
import { generateReply, streamReply } from "../src/lib/llm";
import { AnswerCostLedger } from "../src/lib/answer-cost-ledger";
import { answerResponseFormat } from "../src/lib/structured-answer";
import type { Bindings } from "../src/types/bindings";

const env = { GROQ_API_KEY: "gsk-private-test", OPENAI_API_KEY: "sk-private-test", LLM_MODEL: "openai/gpt-oss-120b" } as Bindings;
const answer = { segments: [{ text: "根拠のある回答", sourceIds: [1] }] };
const json = (content = JSON.stringify(answer), tools?: unknown[]) => Response.json({id:"turn", object:"chat.completion",created:1,model:"openai/gpt-oss-120b",
 choices:[{index:0,finish_reason:tools?"tool_calls":"stop",message:{role:"assistant",content,...(tools?{tool_calls:tools}:{})}}],usage:{prompt_tokens:15,completion_tokens:8,total_tokens:23}});
const sse = (text: string) => 'data: '+JSON.stringify({id:"answer",object:"chat.completion.chunk",created:1,model:"openai/gpt-oss-120b",choices:[{index:0,delta:{role:"assistant",content:text},finish_reason:null}]})+'\n\n';
const end = 'data: '+JSON.stringify({id:"answer",object:"chat.completion.chunk",created:1,model:"openai/gpt-oss-120b",choices:[{index:0,delta:{},finish_reason:"stop"}]})+'\n\ndata: [DONE]\n\n';
afterEach(()=>vi.unstubAllGlobals());

describe("Groq provider boundary",()=>{
 it("defaults SaaS to Groq and rejects invalid/missing configuration before I/O",()=>{
  expect(resolveLlmRoute(env)).toMatchObject({provider:"groq",model:"openai/gpt-oss-120b",baseURL:"https://api.groq.com/openai/v1"});
  for (const bad of [{LLM_PROVIDER:"typo"},{LLM_MODEL:"bad-model"},{GROQ_API_KEY:""},{OPENAI_API_KEY:""},{LLM_REASONING_EFFORT:"none"}]) {
   expect(()=>resolveLlmRoute({...env,...bad} as Bindings)).toThrow();
  }
 });
 it("keeps on-premises inference local and disallows external providers",()=>{
  expect(resolveLlmRoute({...env,LLM_MODEL:"local-chat",DEPLOYMENT_EDITION:"onprem",OPENAI_BASE_URL:"http://inference/v1"})).toMatchObject({provider:"local",model:"local-chat"});
  expect(()=>resolveLlmRoute({...env,DEPLOYMENT_EDITION:"onprem",LLM_PROVIDER:"groq"})).toThrow("On-premises");
 });
 it("uses strict native output for nonstreaming answers and preserves the system prompt",async()=>{
  vi.stubGlobal("fetch",async (url:unknown,init:RequestInit)=>{
   expect(String(url)).toBe("https://api.groq.com/openai/v1/chat/completions");
   const body=JSON.parse(String(init.body));
   expect(body).toMatchObject({model:"openai/gpt-oss-120b",reasoning_effort:"low",include_reasoning:false,max_completion_tokens:4096,response_format:{type:"json_schema",json_schema:{strict:true}}});
   expect(body.messages[0].content).toBe("Original system prompt");return json();
  });
  expect(await generateReply(env,"Original system prompt","Question")).toEqual(answer);
 });
 it("streams JSON text before completion while retaining final schema validation",async()=>{
  const gate=Promise.withResolvers<void>();
  vi.stubGlobal("fetch",async (_url:unknown,init:RequestInit)=>{
   const body=JSON.parse(String(init.body));expect(body.response_format).toEqual({type:"json_object"});
   expect(body.messages).toContainEqual({role:"system",content:"Original system prompt"});
   return new Response(new ReadableStream({async start(c){const e=new TextEncoder();c.enqueue(e.encode(sse('{"segments":[{"text":"最初')));await gate.promise;c.enqueue(e.encode(sse('の回答","sourceIds":[]}]}')+end));c.close();}}),{headers:{"content-type":"text/event-stream"}});
  });
  const chunks=streamReply(env,"Original system prompt","Question");
  try {expect((await chunks.next()).value).toMatchObject({segmentIndex:0,text:"最初"});gate.resolve();expect((await chunks.next()).value).toMatchObject({text:"の回答"});expect((await chunks.next()).value).toHaveProperty("answer");}
  finally{gate.resolve();await chunks.return();}
 });
 it.each([429,500,502,503,504])("retries %s twice, then switches credentials/model once",async status=>{
  const calls:{url:string;auth:string|null;body:Record<string,unknown>}[]=[];
  vi.stubGlobal("fetch",async(url:unknown,init:RequestInit)=>{
   calls.push({url:String(url),auth:new Headers(init.headers).get("authorization"),body:JSON.parse(String(init.body))});
   return String(url).includes("api.groq.com")?Response.json({error:{message:"temporarily unavailable"}},{status}):json();
  });
  const ledger=new AnswerCostLedger();expect(await generateReply(env,"S","Q",ledger)).toEqual(answer);
  expect(calls).toHaveLength(3);expect(calls[2]).toMatchObject({url:"https://api.openai.com/v1/chat/completions",auth:"Bearer sk-private-test",body:{model:"gpt-4o-mini"}});
  expect(calls[2].body).not.toHaveProperty("reasoning_effort");expect(calls[2].body).not.toHaveProperty("include_reasoning");
  expect(ledger.calls.map(c=>c.provider)).toEqual(["groq","groq","openai"]);
 });
 it.each([400,401,403,404,422])("does not fallback or expose an echoed key for %s",async status=>{
  const fetch=vi.fn(async()=>Response.json({error:{message:"gsk-private-test sk-private-test"}},{status}));vi.stubGlobal("fetch",fetch);
  try {await generateReply(env,"S","Q");throw new Error("expected refusal");}catch(error){expect((error as Error).name).toBe("LlmConfigurationError");expect(String(error)).not.toContain("private-test");}
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("does not replay an answer after receiving its first frame",async()=>{
  const fetch=vi.fn(async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(sse('{"segments":[{"text":"Partial')));setTimeout(()=>c.error(new Error("socket disconnected")),10);}}),{headers:{"content-type":"text/event-stream"}}));
  vi.stubGlobal("fetch",fetch);const chunks=streamReply(env,"S","Q");expect((await chunks.next()).value).toHaveProperty("text","Partial");await expect(chunks.next()).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("separates tool selection from final Groq output grammar",async()=>{
  vi.stubGlobal("fetch",async(_url:unknown,init:RequestInit)=>{
   const body=JSON.parse(String(init.body));expect(body.stream).toBe(false);expect(body.response_format).toBeUndefined();expect(body.parallel_tool_calls).toBe(false);
   return json("Private preamble",[{id:"search",type:"function",function:{name:"search_scenes",arguments:'{"query":"test"}'}}]);
  });
  const model=createChatModel(env,{maxTokens:1024,timeoutMs:1000});
  const message=await model.invoke([new HumanMessage("Find evidence")],{response_format:answerResponseFormat,tools:[{type:"function",function:{name:"search_scenes",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}}]});
  expect(message.tool_calls?.[0].name).toBe("search_scenes");expect(message.text).toBe("");
 });
 it("uses GPT-OSS json tool output only as a stop signal and regenerates from original evidence",async()=>{
  let calls=0;
  vi.stubGlobal("fetch",async(_url:unknown,init:RequestInit)=>{
   const body=JSON.parse(String(init.body));calls++;
   if(calls===1){
    expect(body.tools.some((t:{function:{name:string}})=>t.function.name==="json")).toBe(true);
    return json("",[{id:"done",type:"function",function:{name:"json",arguments:'{"segments":[{"text":"Discard this draft","sourceIds":[]}]}'}}]);
   }
   expect(body.tools).toBeUndefined();expect(JSON.stringify(body.messages)).not.toContain("Discard this draft");
   expect(body.response_format.type).toBe("json_schema");return json();
  });
  const model=createChatModel(env,{maxTokens:1024,timeoutMs:1000});
  const message=await model.invoke([new HumanMessage("Find evidence")],{response_format:answerResponseFormat,tools:[{type:"function",function:{name:"search_scenes",parameters:{type:"object",properties:{}}}}]});
  expect(message.tool_calls).toHaveLength(0);expect(JSON.parse(message.text)).toEqual(answer);expect(calls).toBe(2);
 });
 it("can explicitly select hosted OpenAI without a Groq key",async()=>{
  vi.stubGlobal("fetch",async(url:unknown)=>{expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");return json();});
  expect(await generateReply({...env,LLM_PROVIDER:"openai",LLM_MODEL:"gpt-4o-mini",GROQ_API_KEY:undefined},"S","Q")).toEqual(answer);
 });
 it("retries transport failures before the first stream frame, then uses OpenAI",async()=>{
  const fetch=vi.fn(async(url:unknown)=>{
   if(String(url).includes("api.groq.com")) return new Response(new ReadableStream({start(c){c.error(Object.assign(new Error("connection reset"),{code:"ECONNRESET"}));}}),{headers:{"content-type":"text/event-stream"}});
   return new Response(sse(JSON.stringify(answer))+end,{headers:{"content-type":"text/event-stream"}});
  });
  vi.stubGlobal("fetch",fetch);const chunks=[];for await(const c of streamReply(env,"S","Q"))chunks.push(c);
  expect(chunks.at(-1)).toHaveProperty("answer",answer);expect(fetch).toHaveBeenCalledTimes(3);
 });
 it("recognizes SDK timeout classes and rejects nested TLS failures and cancellation",()=>{
  class APIConnectionTimeoutError extends Error {}
  expect(isTransientInferenceError(new APIConnectionTimeoutError("timeout"))).toBe(true);
  expect(isTransientInferenceError(Object.assign(new Error("socket"),{cause:{code:"UND_ERR_SOCKET"}}))).toBe(true);
  const tls=Object.assign(new Error("Connection error"),{name:"APIConnectionError",cause:{cause:{code:"CERT_HAS_EXPIRED"}}});
  expect(isTransientInferenceError(tls)).toBe(false);
  const controller=new AbortController();controller.abort();
  expect(isTransientInferenceError(new APIConnectionTimeoutError("timeout"),controller.signal)).toBe(false);
 });
 it("never opens a request after caller cancellation",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const controller=new AbortController();controller.abort();
  const model=createChatModel(env,{maxTokens:1024,timeoutMs:1000});
  await expect(model.invoke([new HumanMessage("Question")],{signal:controller.signal})).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
 });
 it("rejects hosted URLs in the local configuration",()=>{
  for(const url of ["https://api.openai.com/v1","https://api.groq.com/openai/v1","not-a-url"])
   expect(()=>resolveLlmRoute({...env,LLM_PROVIDER:"local",LLM_MODEL:"local-chat",OPENAI_BASE_URL:url})).toThrow();
 });
});
