import type { RpcCaller } from "./contracts";

export interface TrpcContext extends Record<string, unknown> {
  userId: string | null;
  assertAdmin: () => Promise<void>;
  call: RpcCaller;
}
