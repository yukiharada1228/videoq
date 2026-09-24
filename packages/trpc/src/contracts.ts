import type { z } from "zod";
import type { inputSchemas } from "./inputs";
import type { outputSchemas } from "./outputs";

/** Handlers receive validated inputs, including Zod defaults and transforms. */
export type RpcInputMap = {
  [Name in keyof typeof inputSchemas]: z.output<(typeof inputSchemas)[Name]>;
};

/** Handler outputs and router validation use the same schema map. */
export type RpcOutputMap = {
  [Name in keyof typeof outputSchemas]: z.output<(typeof outputSchemas)[Name]>;
};

export type ProcedureName = keyof RpcInputMap;

export type RpcCaller = <Name extends ProcedureName>(
  name: Name,
  input: RpcInputMap[Name],
) => Promise<RpcOutputMap[Name]>;

export type ProcedureHandlers = {
  [Name in ProcedureName]: (
    input: RpcInputMap[Name],
  ) => Promise<RpcOutputMap[Name]>;
};
