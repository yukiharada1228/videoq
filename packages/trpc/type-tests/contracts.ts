import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { ProcedureHandlers, RpcInputMap } from "../src/contracts";
import type { Tag, TagPage } from "../src/models";
import type { AppRouter } from "../src/router";
import type { TagColor } from "../src/schema";

type Inputs = inferRouterInputs<AppRouter>;
type Outputs = inferRouterOutputs<AppRouter>;
type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

export type ContractAssertions = [
  Assert<Equal<Inputs["tags"]["create"]["color"], TagColor | undefined>>,
  Assert<Equal<Inputs["tags"]["update"]["color"], TagColor | undefined>>,
  Assert<Equal<RpcInputMap["tags.create"]["color"], TagColor>>,
  Assert<Equal<Outputs["tags"]["create"], Tag>>,
  Assert<Equal<Outputs["tags"]["list"], TagPage>>,
];

declare const createTag: (input: Inputs["tags"]["create"]) => void;
createTag({ name: "Lecture" });
createTag({ name: "Lecture", color: "light-blue" });
// @ts-expect-error Arbitrary colors must not be accepted by the client contract.
createTag({ name: "Lecture", color: "not-a-color" });

declare const registerHandler: (handler: ProcedureHandlers["tags.create"]) => void;
// @ts-expect-error A handler cannot return a tag with missing required fields.
registerHandler(async () => ({ id: 1, name: "Lecture", color: "blue" }));
