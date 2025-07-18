from django.conf import settings
from app.plan_constants import PLAN_INFO, DEFAULT_PLAN_KEY
import logging


def get_plan_name_from_product_id(product_id):
    """
    Stripeのproduct_idからプラン名を取得。
    settings.pyのSTRIPE_PRODUCT_IDSとの完全一致で判定。
    """
    if not product_id:
        return "free"
    for plan_key, prod_id in settings.STRIPE_PRODUCT_IDS.items():
        if product_id == prod_id:
            logging.info(f"Matched product_id {product_id} to plan {plan_key} via settings")
            return plan_key
    logging.error(f"Could not determine plan for product_id: {product_id}")
    return "free"

# 非推奨: price_idベースの判定
# 今後はget_plan_name_from_product_idを使用してください
def get_plan_name_from_price_id(price_id):
    """
    Stripeのprice_idからプラン名を取得（非推奨）。
    settings.pyのSTRIPE_PRICE_IDSとの完全一致で判定。
    """
    if not price_id:
        return "free"
    allowed_plans = PLAN_INFO.keys()
    for plan_key in allowed_plans:
        if price_id == settings.STRIPE_PRICE_IDS.get(plan_key):
            logging.info(f"Matched price_id {price_id} to plan {plan_key} via settings")
            return plan_key
    logging.error(f"Could not determine plan for price_id: {price_id}")
    return "free"


def log_subscription_change(
    user,
    old_plan,
    new_plan,
    old_subscribed,
    new_subscribed,
    stripe_event_id=None,
    stripe_subscription_id=None,
    change_reason="",
):
    from app.models import SubscriptionChangeLog

    SubscriptionChangeLog.objects.create(
        user=user,
        old_plan=old_plan,
        new_plan=new_plan,
        old_subscribed=old_subscribed,
        new_subscribed=new_subscribed,
        stripe_event_id=stripe_event_id,
        stripe_subscription_id=stripe_subscription_id,
        change_reason=change_reason,
    )


def restore_user_sharing(user):
    from app.models import VideoGroup

    restored_count = 0
    groups_with_history = VideoGroup.objects.filter(
        user=user, previous_share_token__isnull=False, share_token__isnull=True
    )
    for group in groups_with_history:
        if group.restore_share_token():
            group.save()
            restored_count += 1
            logging.info(f"Restored sharing for group: {group.name}")
    return restored_count


def disable_user_sharing(user):
    from app.models import VideoGroup

    shared_groups = VideoGroup.objects.filter(user=user, share_token__isnull=False)
    for group in shared_groups:
        group.save_share_token_history()
        group.share_token = None
        group.save()
        logging.info(f"Disabled sharing for group: {group.name} (saved history)")
    return len(shared_groups)


def enforce_video_limit_for_plan(user, new_plan):
    """
    プラン変更時に動画本数制限を適用する

    Args:
        user: ユーザーオブジェクト
        new_plan: 新しいプラン名

    Returns:
        int: 削除された動画の数

    削除条件:
    1. 現在の動画数が新しいプランの制限を超えている場合
    2. 削除対象は古い順（uploaded_at順）
    3. 削除前にS3ファイルも削除
    4. Pineconeのベクトルデータも削除
    """
    from app.models import Video

    # 新しいプランの制限を取得
    plan_info = PLAN_INFO.get(new_plan, PLAN_INFO[DEFAULT_PLAN_KEY])
    new_limit = plan_info["limit"]
    current_video_count = user.videos.count()

    if current_video_count <= new_limit:
        logging.info(
            f"User {user.id}: Video count ({current_video_count}) is within limit ({new_limit}) for plan {new_plan}"
        )
        return 0

    videos_to_delete = current_video_count - new_limit
    logging.info(
        f"User {user.id}: Need to delete {videos_to_delete} videos to meet limit {new_limit} for plan {new_plan}"
    )

    # 古い順に動画を取得（削除対象）
    old_videos = Video.objects.filter(user=user).order_by("uploaded_at")[
        :videos_to_delete
    ]
    deleted_count = 0

    for video in old_videos:
        try:
            # Videoモデルのdeleteメソッドで完全削除（Pinecone + S3 + DB）
            video.delete()
            deleted_count += 1
            logging.info(
                f"User {user.id}: Deleted video {video.id} ({video.title}) due to plan change to {new_plan}"
            )
        except Exception as e:
            logging.error(f"User {user.id}: Failed to delete video {video.id}: {e}")

    logging.info(
        f"User {user.id}: Successfully deleted {deleted_count} videos for plan change to {new_plan}"
    )
    return deleted_count


def handle_plan_change(
    user,
    old_plan,
    new_plan,
    change_reason="",
    stripe_event_id=None,
    stripe_subscription_id=None,
):
    """
    プラン変更時の一貫した処理フローを実行

    Args:
        user: ユーザーオブジェクト
        old_plan: 変更前のプラン
        new_plan: 変更後のプラン
        change_reason: 変更理由
        stripe_event_id: StripeイベントID
        stripe_subscription_id: StripeサブスクリプションID

    Returns:
        dict: 処理結果
    """
    from app.models import Video

    # 変更前の状態を記録
    old_subscribed = user.is_subscribed
    new_subscribed = new_plan != "free"

    # プラン変更を一度に実行（一時的なfreeプラン設定を避ける）
    user.is_subscribed = new_subscribed
    user.subscription_plan = new_plan
    user.save()

    # 変更ログを記録
    log_subscription_change(
        user=user,
        old_plan=old_plan,
        new_plan=new_plan,
        old_subscribed=old_subscribed,
        new_subscribed=new_subscribed,
        stripe_event_id=stripe_event_id,
        stripe_subscription_id=stripe_subscription_id,
        change_reason=change_reason,
    )

    # 共有URLの処理
    if new_subscribed and not old_subscribed:
        # 無料→有料: 共有URLを復活
        restored_count = restore_user_sharing(user)
        logging.info(
            f"User {user.id}: Restored {restored_count} shared groups due to plan upgrade"
        )
    elif not new_subscribed and old_subscribed:
        # 有料→無料: 共有URLを無効化
        disabled_count = disable_user_sharing(user)
        logging.info(
            f"User {user.id}: Disabled {disabled_count} shared groups due to plan downgrade"
        )

    # 動画本数制限の適用
    deleted_count = enforce_video_limit_for_plan(user, new_plan)
    if deleted_count > 0:
        logging.info(
            f"User {user.id}: Deleted {deleted_count} videos due to plan change from {old_plan} to {new_plan}"
        )

    return {
        "status": "success",
        "user_id": user.id,
        "old_plan": old_plan,
        "new_plan": new_plan,
        "old_subscribed": old_subscribed,
        "new_subscribed": new_subscribed,
        "restored_sharing": (
            restored_count if new_subscribed and not old_subscribed else 0
        ),
        "disabled_sharing": (
            disabled_count if not new_subscribed and old_subscribed else 0
        ),
        "deleted_videos": deleted_count,
    }
