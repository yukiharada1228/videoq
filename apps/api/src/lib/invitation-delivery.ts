import {
  recordInvitationDeliveryOutcomes,
  rotateInvitationTokenForDelivery,
} from "../repositories/group-invitation-repository";
import type { Bindings } from "../types/bindings";
import { createInvitationToken, hashInvitationToken } from "./group-invitations";
import { sendMail } from "./mail";

function frontendBaseUrl(env: Bindings): string {
  return (env.FRONTEND_URL?.trim() || "https://videoq.jp").replace(/\/+$/, "");
}

export function invitationUrl(env: Bindings, token: string): string {
  return `${frontendBaseUrl(env)}/group-invitations/${encodeURIComponent(token)}`;
}

export function invitationMessage(
  groupName: string,
  inviterName: string,
  url: string,
): string[] {
  return [
    `${inviterName}さんからVideoQの「${groupName}」グループへ招待されました。`,
    "以下のURLから招待内容を確認し、7日以内に承認してください。",
    "",
    "招待を確認:",
    url,
    "",
    "リンクを開いただけではグループに参加しません。心当たりがない場合は、このメールを破棄してください。",
  ];
}

export type InvitationDeliveryResult =
  | { delivered: true }
  /** 招待が pending でなくなった（取り消し・承認済み・失効）。再試行しない。 */
  | { skipped: true; reason: string };

/**
 * 招待メールを 1 通配送する。external task から呼ばれる唯一の送信経路。
 *
 * トークンは「送信の直前」にここで発行する。enqueue 時点では推測不能な
 * ダミーの hash しか入っておらず、平文トークンがキューにもDBにも残らない。
 * 再試行のたびにトークンは作り直され、古いリンクは即座に無効になる。
 */
export async function deliverInvitationEmail(
  env: Bindings,
  invitationId: number,
  now = new Date(),
): Promise<InvitationDeliveryResult> {
  const token = createInvitationToken();
  const rotated = await rotateInvitationTokenForDelivery(
    env,
    invitationId,
    await hashInvitationToken(token),
    now,
  );
  if ("notFound" in rotated) {
    return { skipped: true, reason: "notFound" };
  }
  if ("invalidState" in rotated) {
    return { skipped: true, reason: rotated.invalidState };
  }

  try {
    await sendMail(
      env,
      rotated.email,
      `[VideoQ] 「${rotated.groupName}」への招待`,
      invitationMessage(
        rotated.groupName,
        rotated.inviterName,
        invitationUrl(env, token),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 失敗も記録してからthrowする。task 側のバックオフで再試行される。
    await recordInvitationDeliveryOutcomes(env, [
      { invitationId, status: "failed", attemptedAt: now, error: message },
    ]);
    throw error;
  }

  await recordInvitationDeliveryOutcomes(env, [
    { invitationId, status: "sent", attemptedAt: now },
  ]);
  return { delivered: true };
}
