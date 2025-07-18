import stripe
from django.conf import settings
import logging
from app.plan_constants import PLAN_INFO


class StripeService:
    def __init__(self, api_key=None):
        self.api_key = api_key or settings.STRIPE_SECRET_KEY
        stripe.api_key = self.api_key

    def _get_user_by_customer_id(self, customer_id, user_model, logger=logging):
        """
        顧客IDからユーザーを取得する共通処理
        
        Args:
            customer_id: Stripe顧客ID
            user_model: Userモデル
            logger: ログ出力用
            
        Returns:
            dict: 取得結果
                - status: "success" | "error"
                - user: Userオブジェクト（成功時）
                - message: str (エラーメッセージ、失敗時)
        """
        if not customer_id:
            logger.error("No customer_id provided")
            return {"status": "error", "message": "No customer_id"}
        
        try:
            user = user_model.objects.select_for_update().get(stripe_customer_id=customer_id)
            return {"status": "success", "user": user}
        except user_model.DoesNotExist:
            logger.error(f"User with customer_id {customer_id} not found")
            return {"status": "error", "message": "User not found"}
        except Exception as e:
            logger.error(f"Error getting user by customer_id {customer_id}: {e}")
            return {"status": "error", "message": str(e)}

    def _extract_product_id_from_subscription(self, subscription):
        """
        サブスクリプションからproduct_idを抽出する共通処理
        
        Args:
            subscription: Stripeサブスクリプションオブジェクトまたは辞書
            
        Returns:
            str | None: product_id（見つからない場合はNone）
        """
        if not subscription:
            return None
            
        # items取得
        items = []
        if isinstance(subscription, dict):
            items_obj = subscription.get("items")
            data_val = items_obj.get("data") if (items_obj is not None and isinstance(items_obj, dict)) else None
            if isinstance(data_val, list):
                items = data_val
        else:
            items_obj = getattr(subscription, "items", None)
            if items_obj and hasattr(items_obj, "data") and isinstance(getattr(items_obj, "data", None), list):
                items = items_obj.data
                
        # product_id取得
        if items and len(items) > 0:
            first_item = items[0]
            if isinstance(first_item, dict):
                price = first_item.get("price") if (first_item is not None and isinstance(first_item, dict)) else None
                if isinstance(price, dict):
                    return price.get("product") if (price is not None and isinstance(price, dict)) else None
            else:
                price = getattr(first_item, "price", None)
                return getattr(price, "product", None) if price else None
                
        return None

    def _extract_subscription_status(self, subscription):
        """
        サブスクリプションからステータス情報を抽出する共通処理
        
        Args:
            subscription: Stripeサブスクリプションオブジェクトまたは辞書
            
        Returns:
            dict: ステータス情報
                - status: str (サブスクリプションステータス)
                - cancel_at_period_end: bool (期間終了時にキャンセル設定されているか)
        """
        if isinstance(subscription, dict):
            status = subscription.get("status")
            cancel_at_period_end = subscription.get("cancel_at_period_end", False)
        else:
            status = getattr(subscription, "status", None)
            cancel_at_period_end = getattr(subscription, "cancel_at_period_end", False)
            
        return {
            "status": status,
            "cancel_at_period_end": cancel_at_period_end
        }

    def _check_remaining_active_subscriptions(self, user, target_subscription_id, logger=logging):
        """
        特定のサブスクリプション以外のアクティブなサブスクリプションがあるかチェック
        
        Args:
            user: Userオブジェクト
            target_subscription_id: 除外するサブスクリプションID
            logger: ログ出力用
            
        Returns:
            bool: 他のアクティブなサブスクリプションがあるかどうか
        """
        if not user.stripe_customer_id:
            return False
            
        try:
            subscriptions = stripe.Subscription.list(customer=user.stripe_customer_id, status="active")
            active_subscriptions = [sub.id for sub in subscriptions.auto_paging_iter()]
            remaining_subscriptions = [sub_id for sub_id in active_subscriptions if sub_id != target_subscription_id]
            return len(remaining_subscriptions) > 0
        except Exception as e:
            logger.error(f"Error checking active subscriptions for user {user.id}: {e}")
            return False

    def _handle_plan_change_common(self, user, old_plan, new_plan, change_reason, stripe_event_id, stripe_subscription_id, plan_utils, logger=logging):
        """
        プラン変更の共通処理
        
        Args:
            user: Userオブジェクト
            old_plan: 変更前のプラン
            new_plan: 変更後のプラン
            change_reason: 変更理由
            stripe_event_id: StripeイベントID
            stripe_subscription_id: StripeサブスクリプションID
            plan_utils: プラン判定・動画制限ユーティリティ
            logger: ログ出力用
            
        Returns:
            dict: プラン変更結果
        """
        result = plan_utils.handle_plan_change(
            user=user,
            old_plan=old_plan,
            new_plan=new_plan,
            change_reason=change_reason,
            stripe_event_id=stripe_event_id,
            stripe_subscription_id=stripe_subscription_id,
        )
        
        # 旧activeサブスクリプションのキャンセル
        if stripe_subscription_id:
            self._cancel_old_active_subscriptions(user, stripe_subscription_id, logger)
            
        return result

    def _determine_plan_from_subscription_data(self, subscription_data, plan_utils, logger=logging):
        """
        サブスクリプションデータからプランを決定する共通処理
        
        Args:
            subscription_data: サブスクリプションデータ
            plan_utils: プラン判定・動画制限ユーティリティ
            logger: ログ出力用
            
        Returns:
            str: 決定されたプラン名
        """
        product_id = self._extract_product_id_from_subscription(subscription_data)
        if product_id:
            plan = plan_utils.get_plan_name_from_product_id(product_id)
            return plan if plan in PLAN_INFO.keys() else "free"
        return "free"

    def get_subscription(self, customer_id):
        """
        顧客IDから最新のサブスクリプション情報を取得
        
        Returns:
            stripe.Subscription | dict | None: 
                - Stripeサブスクリプションオブジェクト（成功時）
                - エラー辞書（顧客が見つからない場合）
                - None（その他のエラーまたはサブスクリプションなし）
        """
        try:
            subscriptions = stripe.Subscription.list(
                customer=customer_id, status="active", limit=1
            )
            if subscriptions.data:
                return subscriptions.data[0]
            return None
        except stripe.error.InvalidRequestError as e:
            if "No such customer" in str(e):
                logging.warning(
                    f"StripeService: Customer {customer_id} not found in Stripe - sync on hold"
                )
                # エラー情報を含む辞書を返す
                return {"error": "customer_not_found", "message": str(e)}
            else:
                logging.error(f"StripeService: get_subscription error: {e}")
                return None
        except Exception as e:
            logging.error(f"StripeService: get_subscription error: {e}")
            return None

    def get_customer_by_email(self, email):
        """
        メールアドレスからStripe顧客を検索
        """
        try:
            customers = stripe.Customer.list(email=email, limit=1)
            if customers.data:
                return customers.data[0]
            return None
        except Exception as e:
            logging.error(f"StripeService: get_customer_by_email error: {e}")
            return None

    def cancel_user_subscription(self, user, logger=logging):
        """
        ユーザーのサブスクリプションをキャンセル

        Args:
            user: Userモデルインスタンス
            logger: ログ出力用

        Returns:
            dict: キャンセル結果
                - status: "success" | "error"
                - message: str (結果メッセージ)
                - canceled: bool (キャンセルされたかどうか)
        """
        try:
            if not user.stripe_customer_id:
                return {
                    "status": "error",
                    "message": "No Stripe customer ID",
                    "canceled": False,
                }

            # アクティブなサブスクリプションを取得
            subscription = self.get_subscription(user.stripe_customer_id)

            if not subscription:
                return {
                    "status": "success",
                    "message": "No active subscription found",
                    "canceled": False,
                }

            # エラー辞書が返された場合の処理
            if isinstance(subscription, dict) and subscription.get("error"):
                return {
                    "status": "error",
                    "message": subscription.get("message", "Customer not found"),
                    "canceled": False,
                }

            # subscriptionがStripeオブジェクトであることを確認
            if not hasattr(subscription, 'id'):
                return {
                    "status": "error",
                    "message": "Invalid subscription object",
                    "canceled": False,
                }
            
            # 安全に属性にアクセス
            subscription_id = getattr(subscription, 'id', None)
            subscription_status = getattr(subscription, 'status', None)
            
            if not subscription_id:
                return {
                    "status": "error",
                    "message": "Invalid subscription object - no ID",
                    "canceled": False,
                }

            logger.info(f"Canceling subscription {subscription_id} for user {user.id}")

            # 即座にキャンセルを試行
            try:
                canceled_subscription = stripe.Subscription.cancel(subscription_id)
                logger.info(
                    f"Subscription canceled immediately. Status: {canceled_subscription.status}"
                )
                return {
                    "status": "success",
                    "message": "Subscription canceled immediately",
                    "canceled": True,
                }

            except stripe.error.StripeError as stripe_error:
                logger.warning(f"Immediate cancellation failed: {stripe_error}")

                # 即座にキャンセルできない場合は期間終了時にキャンセルを試行
                try:
                    modified_subscription = stripe.Subscription.modify(
                        subscription_id, cancel_at_period_end=True
                    )
                    logger.info(
                        f"Subscription set to cancel at period end. Status: {modified_subscription.status}"
                    )
                    return {
                        "status": "success",
                        "message": "Subscription will be canceled at period end",
                        "canceled": True,
                    }

                except stripe.error.StripeError as modify_error:
                    logger.error(f"Failed to modify subscription: {modify_error}")
                    return {
                        "status": "error",
                        "message": f"Failed to cancel subscription: {modify_error}",
                        "canceled": False,
                    }

        except Exception as e:
            logger.error(f"Error canceling subscription for user {user.id}: {e}")
            return {"status": "error", "message": str(e), "canceled": False}

    def delete_subscription(self, subscription_id, logger=logging):
        """
        サブスクリプションを削除（即座に削除）

        Args:
            subscription_id: 削除対象のサブスクリプションID
            logger: ログ出力用

        Returns:
            dict: 削除結果
                - status: "success" | "error"
                - message: str (結果メッセージ)
        """
        try:
            logger.info(f"Deleting subscription: {subscription_id}")
            stripe.Subscription.delete(subscription_id, invoice_now=False, prorate=True)
            logger.info(f"Successfully deleted subscription: {subscription_id}")
            return {"status": "success", "message": "Subscription deleted successfully"}
        except Exception as e:
            logger.error(f"Error deleting subscription {subscription_id}: {e}")
            return {"status": "error", "message": str(e)}

    def get_subscription_details(self, subscription_id, expand=None, logger=logging):
        """
        サブスクリプションの詳細情報を取得

        Args:
            subscription_id: サブスクリプションID
            expand: 展開する関連オブジェクト（例: ["default_payment_method"]）
            logger: ログ出力用

        Returns:
            dict: 詳細情報取得結果
                - status: "success" | "error"
                - subscription: Stripeサブスクリプションオブジェクト（成功時）
                - message: str (エラーメッセージ、失敗時)
        """
        try:
            logger.info(f"Retrieving detailed subscription: {subscription_id}")
            if expand:
                detailed_subscription = stripe.Subscription.retrieve(
                    subscription_id, expand=expand
                )
            else:
                detailed_subscription = stripe.Subscription.retrieve(subscription_id)

            logger.info(
                f"Successfully retrieved subscription details: {subscription_id}"
            )
            return {"status": "success", "subscription": detailed_subscription}
        except Exception as e:
            logger.error(
                f"Error retrieving subscription details {subscription_id}: {e}"
            )
            return {"status": "error", "message": str(e)}

    def create_checkout_session(self, checkout_params, logger=logging):
        """
        決済セッションを作成

        Args:
            checkout_params: セッション作成パラメータ
            logger: ログ出力用

        Returns:
            dict: セッション作成結果
                - status: "success" | "error"
                - session: Stripeセッションオブジェクト（成功時）
                - message: str (エラーメッセージ、失敗時)
        """
        try:
            logger.info("Creating Stripe checkout session")
            session = stripe.checkout.Session.create(**checkout_params)
            logger.info(f"Successfully created checkout session: {session.id}")
            return {"status": "success", "session": session}
        except Exception as e:
            logger.error(f"Error creating checkout session: {e}")
            return {"status": "error", "message": str(e)}

    def verify_webhook_signature(
        self, payload, sig_header, webhook_secret, logger=logging
    ):
        """
        Webhook署名を検証

        Args:
            payload: Webhookペイロード
            sig_header: 署名ヘッダー
            webhook_secret: Webhook秘密鍵
            logger: ログ出力用

        Returns:
            dict: 検証結果
                - status: "success" | "error"
                - event: Stripeイベントオブジェクト（成功時）
                - message: str (エラーメッセージ、失敗時)
        """
        try:
            logger.info("Verifying webhook signature")
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
            logger.info(
                f"Successfully verified webhook signature for event: {event.get('id')}"
            )
            return {"status": "success", "event": event}
        except ValueError as e:
            logger.error(f"Invalid webhook payload: {e}")
            return {"status": "error", "message": f"Invalid payload: {e}"}
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid webhook signature: {e}")
            return {"status": "error", "message": f"Invalid signature: {e}"}
        except Exception as e:
            logger.error(f"Error verifying webhook signature: {e}")
            return {"status": "error", "message": str(e)}

    def sync_user_subscription(self, user, plan_utils, logger=logging):
        """
        統一されたユーザーサブスクリプション同期処理

        Args:
            user: Userモデルインスタンス
            plan_utils: プラン判定・動画制限ユーティリティ
            logger: ログ出力用

        Returns:
            dict: 同期結果
                - status: "success" | "error"
                - synced: bool (変更があったかどうか)
                - message: str (エラーメッセージ)
        """
        try:
            customer_id = user.stripe_customer_id

            # Stripe顧客IDがない場合は、メールアドレスで顧客を検索
            if not customer_id and user.email:
                logger.info(
                    f"No stripe_customer_id for user {user.id}, searching by email: {user.email}"
                )
                try:
                    customer = self.get_customer_by_email(user.email)
                    if customer:
                        customer_id = customer.id
                        logger.info(f"Found customer by email: {customer_id}")
                        # 顧客IDを保存
                        user.stripe_customer_id = customer_id
                        user.save()
                    else:
                        logger.info(f"No customer found for email: {user.email}")
                        return {
                            "status": "success",
                            "synced": False,
                            "message": "No customer found",
                        }
                except Exception as e:
                    logger.error(f"Error searching customer by email: {e}")
                    return {
                        "status": "error",
                        "synced": False,
                        "message": f"Customer search error: {e}",
                    }

            if not customer_id:
                logger.info(f"No customer_id available for user {user.id}")
                return {
                    "status": "success",
                    "synced": False,
                    "message": "No customer ID",
                }

            # Stripeから最新のサブスクリプション情報を取得
            subscription_result = self.get_subscription(customer_id)

            current_subscription_status = user.is_subscribed
            new_subscription_status = False
            plan = user.subscription_plan  # 現在のプランを初期値として設定

            # 顧客が見つからない場合の処理
            if (
                isinstance(subscription_result, dict)
                and subscription_result.get("error") == "customer_not_found"
            ):
                logger.info(
                    f"Customer {customer_id} not found in Stripe - sync on hold"
                )
                return {
                    "status": "success",
                    "synced": True,  # 不整合として扱う
                    "has_issue": True,  # 不整合フラグを追加
                    "message": "Customer not found in Stripe - sync on hold",
                }

            if subscription_result:
                subscription = subscription_result
                # id取得
                if isinstance(subscription, dict):
                    subscription_id = subscription.get("id")
                else:
                    subscription_id = getattr(subscription, "id", None)
                logger.debug(f"Found subscription: {subscription_id}")
                # product_id取得（共通メソッド使用）
                product_id = self._extract_product_id_from_subscription(subscription)

                if product_id:
                    plan = plan_utils.get_plan_name_from_product_id(product_id)
                    logger.debug(f"Determined plan: {plan}")
                else:
                    # product_idが見つからない場合は既存のプランを維持
                    plan = user.subscription_plan
                    logger.debug(f"No product_id found, maintaining current plan: {plan}")

                # ステータス情報取得（共通メソッド使用）
                status_info = self._extract_subscription_status(subscription)
                subscription_status = status_info["status"]
                cancel_at_period_end = status_info["cancel_at_period_end"]
                new_subscription_status = subscription_status == "active"

                if cancel_at_period_end:
                    new_subscription_status = False

                # --- 旧activeサブスクリプションのキャンセル ---
                if new_subscription_status and subscription_status == "active":
                    self._cancel_old_active_subscriptions(user, subscription_id, logger)
                # --- 追加ここまで ---
            else:
                # 通常のサブスクリプションなしの場合
                # 既存のプランを維持するか、freeに設定するかを検討
                if user.is_subscribed:
                    # 現在サブスクリプション中の場合、既存のプランを維持（一時的な問題の可能性）
                    plan = user.subscription_plan
                    logger.debug(f"No subscriptions found but user is subscribed, maintaining current plan: {plan}")
                    new_subscription_status = True  # 既存の状態を維持
                else:
                    # 実際にサブスクリプションがない場合
                    plan = "free"
                    logger.debug("No subscriptions found, setting plan to free")
                    new_subscription_status = False

            # プラン変更が必要な場合のみhandle_plan_changeを使用
            # 現在のプランと新しいプランが同じ場合は変更処理をスキップ
            if current_subscription_status != new_subscription_status or (
                plan and plan != user.subscription_plan
            ):
                # 統一されたプラン変更処理を使用
                result = plan_utils.handle_plan_change(
                    user=user,
                    old_plan=user.subscription_plan,
                    new_plan=plan if plan else "free",
                    change_reason="sync_user_subscription",
                    stripe_event_id=None,
                    stripe_subscription_id=subscription_result.id if subscription_result else None,
                )

                logger.info(
                    f"User {user.id} subscription status changed from {current_subscription_status} to {new_subscription_status}, plan changed to {user.subscription_plan}"
                )
                return {
                    "status": "success",
                    "synced": True,
                    "message": "Subscription updated",
                }
            else:
                # 状態が変わらなくても必ず動画本数制限をenforce
                deleted_count = plan_utils.enforce_video_limit_for_plan(
                    user, user.subscription_plan
                )
                if deleted_count > 0:
                    logger.info(
                        f"User {user.id}: Deleted {deleted_count} videos to meet plan limit {user.subscription_plan} (no status change)"
                    )

            return {
                "status": "success",
                "synced": False,
                "message": "No changes needed",
            }

        except Exception as e:
            logger.error(f"Sync error for user {user.id}: {e}")
            return {"status": "error", "synced": False, "message": str(e)}

    def _cancel_old_active_subscriptions(self, user, new_subscription_id, logger=logging):
        """
        ユーザーのactiveサブスクリプションが2つ以上ある場合、新しいもの以外をキャンセル
        """
        if not user.stripe_customer_id or not new_subscription_id:
            logger.info("_cancel_old_active_subscriptions: customer_idまたはnew_subscription_idがありません")
            return
        subscriptions = stripe.Subscription.list(customer=user.stripe_customer_id, status="active")
        active_ids = [sub.id for sub in subscriptions.auto_paging_iter()]
        logger.info(f"[サブスク自動整理] 現在activeなサブスクリプション: {active_ids}, 新規: {new_subscription_id}")
        if len(active_ids) > 1:
            for sub in subscriptions.auto_paging_iter():
                if sub.id != new_subscription_id:
                    try:
                        stripe.Subscription.cancel(sub.id)
                        logger.info(f"[サブスク自動整理] 旧activeサブスクリプションをキャンセル: {sub.id}")
                    except Exception as e:
                        logger.error(f"[サブスク自動整理] 旧サブスクリプション{sub.id}のキャンセルに失敗: {e}")
        else:
            logger.info("[サブスク自動整理] activeサブスクリプションは1つのみ。キャンセル不要")

    def handle_checkout_completed(
        self, session_data, user_model, plan_utils, logger=logging
    ):
        """
        checkout.session.completedイベントの処理
        user_model: Userモデル（DI用）
        plan_utils: プラン判定・動画制限ユーティリティ（DI用）
        logger: ログ出力用
        """
        user_id = session_data.get("client_reference_id")
        if not user_id:
            logger.error("No client_reference_id in checkout session")
            return {"status": "error", "message": "No client_reference_id"}

        try:
            user = user_model.objects.select_for_update().get(id=user_id)
            old_plan = user.subscription_plan

            # metadataからplan_nameを取得
            plan = None
            metadata = session_data.get("metadata")
            if metadata and "plan_name" in metadata:
                plan = metadata["plan_name"]
            # plan_nameがmetadata等に無い場合はproduct_idから判定（price_idは非推奨）
            if not plan:
                line_items = session_data.get("display_items") or session_data.get("line_items")
                product_id = None
                if line_items and len(line_items) > 0:
                    product_id = line_items[0].get("price", {}).get("product")
                if not product_id:
                    subscription_id = session_data.get("subscription")
                    if subscription_id:
                        subscription = self.get_subscription(subscription_id)
                        if subscription and subscription["items"]["data"]:
                            product_id = subscription["items"]["data"][0]["price"]["product"]
                plan = (
                    plan_utils.get_plan_name_from_product_id(product_id)
                    if product_id
                    else "free"
                )

            new_plan = plan if plan in PLAN_INFO.keys() else "free"

            # Stripe customer IDを設定
            if session_data.get("customer"):
                user.stripe_customer_id = session_data["customer"]

            # 統一されたプラン変更処理を使用
            result = plan_utils.handle_plan_change(
                user=user,
                old_plan=old_plan,
                new_plan=new_plan,
                change_reason="checkout_completed",
                stripe_event_id=session_data.get("id"),
                stripe_subscription_id=session_data.get("subscription"),
            )

            # --- 旧activeサブスクリプションのキャンセル ---
            new_subscription_id = session_data.get("subscription")
            self._cancel_old_active_subscriptions(user, new_subscription_id, logger)
            # --- 追加ここまで ---

            return {
                "status": "success",
                "user_id": user.id,
                "plan": new_plan,
                "restored_sharing": result.get("restored_sharing", 0),
            }
        except user_model.DoesNotExist:
            logger.error(f"User with ID {user_id} not found")
            return {"status": "error", "message": "User not found"}
        except Exception as e:
            logger.error(f"Error handling checkout completed: {e}")
            raise

    def handle_subscription_created(
        self, subscription_data, user_model, plan_utils, logger=logging
    ):
        """
        customer.subscription.createdイベントの処理
        user_model: Userモデル（DI用）
        plan_utils: プラン判定・動画制限ユーティリティ（DI用）
        logger: ログ出力用
        """
        customer_id = subscription_data.get("customer")
        
        # ユーザー取得
        user_result = self._get_user_by_customer_id(customer_id, user_model, logger)
        if user_result["status"] != "success":
            return user_result
            
        user = user_result["user"]
        old_plan = user.subscription_plan

        # プラン決定
        new_plan = self._determine_plan_from_subscription_data(subscription_data, plan_utils, logger)

        # プラン変更処理
        result = self._handle_plan_change_common(
            user=user,
            old_plan=old_plan,
            new_plan=new_plan,
            change_reason="subscription_created",
            stripe_event_id=subscription_data.get("id"),
            stripe_subscription_id=subscription_data.get("id"),
            plan_utils=plan_utils,
            logger=logger
        )

        return {
            "status": "success",
            "user_id": user.id,
            "plan": new_plan,
            "restored_sharing": result.get("restored_sharing", 0),
        }

    def handle_subscription_updated(
        self, subscription_data, user_model, plan_utils, logger=logging
    ):
        """
        customer.subscription.updatedイベントの処理
        user_model: Userモデル（DI用）
        plan_utils: プラン判定・動画制限ユーティリティ（DI用）
        logger: ログ出力用
        """
        customer_id = subscription_data.get("customer")
        
        # ユーザー取得
        user_result = self._get_user_by_customer_id(customer_id, user_model, logger)
        if user_result["status"] != "success":
            return user_result
            
        user = user_result["user"]
        old_plan = user.subscription_plan
        
        # ステータス情報取得
        status_info = self._extract_subscription_status(subscription_data)
        subscription_status = status_info["status"]
        cancel_at_period_end = status_info["cancel_at_period_end"]

        # 新しいプランを事前に決定
        new_plan = "free"
        if subscription_status == "active" and not cancel_at_period_end:
            new_plan = self._determine_plan_from_subscription_data(subscription_data, plan_utils, logger)

        # プラン変更処理
        result = self._handle_plan_change_common(
            user=user,
            old_plan=old_plan,
            new_plan=new_plan,
            change_reason="subscription_updated",
            stripe_event_id=subscription_data.get("id"),
            stripe_subscription_id=subscription_data.get("id"),
            plan_utils=plan_utils,
            logger=logger
        )

        return {
            "status": "success",
            "user_id": user.id,
            "plan": new_plan,
            "subscription_status": subscription_status,
        }

    def handle_subscription_deleted(
        self, subscription_data, user_model, plan_utils, logger=logging
    ):
        """
        customer.subscription.deletedイベントの処理
        user_model: Userモデル（DI用）
        plan_utils: プラン判定・動画制限ユーティリティ（DI用）
        logger: ログ出力用
        """
        customer_id = subscription_data.get("customer")
        
        # ユーザー取得
        user_result = self._get_user_by_customer_id(customer_id, user_model, logger)
        if user_result["status"] != "success":
            return user_result
            
        user = user_result["user"]
        old_plan = user.subscription_plan

        # 削除されたサブスクリプションID
        deleted_subscription_id = subscription_data.get("id")
        
        # 他のアクティブなサブスクリプションがあるかチェック
        new_plan = "free"  # デフォルトはfree
        if self._check_remaining_active_subscriptions(user, deleted_subscription_id, logger):
            # 他のアクティブなサブスクリプションがある場合、既存のプランを維持
            logger.info(f"User {user.id}: Other active subscriptions exist, maintaining current plan: {old_plan}")
            new_plan = old_plan
        else:
            # 他のアクティブなサブスクリプションがない場合のみfreeプランに設定
            logger.info(f"User {user.id}: No other active subscriptions, setting to free plan")
            new_plan = "free"

        # プラン変更処理
        result = self._handle_plan_change_common(
            user=user,
            old_plan=old_plan,
            new_plan=new_plan,
            change_reason="subscription_deleted",
            stripe_event_id=subscription_data.get("id"),
            stripe_subscription_id=subscription_data.get("id"),
            plan_utils=plan_utils,
            logger=logger
        )

        if new_plan == "free":
            logger.info(f"User {user.id} subscription cancelled (no active subscriptions remaining)")
        else:
            logger.info(f"User {user.id} subscription cancelled (other active subscriptions remain)")
        
        return {
            "status": "success",
            "user_id": user.id,
        }

    def handle_invoice_payment_succeeded(
        self, invoice_data, user_model, plan_utils, logger=logging
    ):
        """
        invoice.payment_succeededイベントの処理
        user_model: Userモデル（DI用）
        plan_utils: プラン判定・動画制限ユーティリティ（DI用）
        logger: ログ出力用
        """
        customer_id = invoice_data.get("customer")
        if not customer_id:
            logger.error("No customer_id in invoice payment")
            return {"status": "error", "message": "No customer_id"}
        try:
            user = user_model.objects.select_for_update().get(
                stripe_customer_id=customer_id
            )
            old_plan = user.subscription_plan

            # 現在のサブスクリプション情報を取得してプランを決定
            subscription_id = invoice_data.get("subscription")
            new_plan = old_plan  # デフォルトは現在のプランを維持

            if subscription_id:
                subscription = self.get_subscription(subscription_id)
                if subscription:
                    items = subscription.get("items", {}).get("data", [])
                    if items:
                        product_id = items[0].get("price", {}).get("product")
                        if product_id:
                            plan = plan_utils.get_plan_name_from_product_id(product_id)
                            if plan in PLAN_INFO.keys():
                                new_plan = plan

            # 統一されたプラン変更処理を使用
            result = plan_utils.handle_plan_change(
                user=user,
                old_plan=old_plan,
                new_plan=new_plan,
                change_reason="payment_succeeded",
                stripe_event_id=invoice_data.get("id"),
                stripe_subscription_id=subscription_id,
            )

            logger.info(f"User {user.id} subscription renewed")
            return {
                "status": "success",
                "user_id": user.id,
                "restored_sharing": result.get("restored_sharing", 0),
            }
        except user_model.DoesNotExist:
            logger.error(f"User with customer_id {customer_id} not found")
            return {"status": "error", "message": "User not found"}
        except Exception as e:
            logger.error(f"Error handling invoice payment succeeded: {e}")
            raise

    def handle_invoice_payment_failed(
        self, invoice_data, user_model, plan_utils, logger=logging
    ):
        """
        invoice.payment_failedイベントの処理
        user_model: Userモデル（DI用）
        plan_utils: プラン判定・動画制限ユーティリティ（DI用）
        logger: ログ出力用
        """
        customer_id = invoice_data.get("customer")
        if not customer_id:
            logger.error("No customer_id in invoice payment failed")
            return {"status": "error", "message": "No customer_id"}
        try:
            user = user_model.objects.select_for_update().get(
                stripe_customer_id=customer_id
            )
            old_plan = user.subscription_plan

            # 失敗したサブスクリプションID
            failed_subscription_id = invoice_data.get("subscription")
            
            # 他のアクティブなサブスクリプションがあるかチェック
            new_plan = "free"  # デフォルトはfree
            if user.stripe_customer_id:
                try:
                    subscriptions = stripe.Subscription.list(customer=user.stripe_customer_id, status="active")
                    active_subscriptions = [sub.id for sub in subscriptions.auto_paging_iter()]
                    
                    # 失敗したサブスクリプション以外のアクティブなサブスクリプションがある場合
                    remaining_subscriptions = [sub_id for sub_id in active_subscriptions if sub_id != failed_subscription_id]
                    
                    if remaining_subscriptions:
                        # 他のアクティブなサブスクリプションがある場合、既存のプランを維持
                        logger.info(f"User {user.id}: Other active subscriptions exist ({remaining_subscriptions}), maintaining current plan: {old_plan}")
                        new_plan = old_plan
                    else:
                        # 他のアクティブなサブスクリプションがない場合のみfreeプランに設定
                        logger.info(f"User {user.id}: No other active subscriptions, setting to free plan due to payment failure")
                        new_plan = "free"
                except Exception as e:
                    logger.error(f"Error checking active subscriptions for user {user.id}: {e}")
                    # エラーの場合は既存のプランを維持
                    new_plan = old_plan

            # 統一されたプラン変更処理を使用
            result = plan_utils.handle_plan_change(
                user=user,
                old_plan=old_plan,
                new_plan=new_plan,
                change_reason="payment_failed",
                stripe_event_id=invoice_data.get("id"),
                stripe_subscription_id=failed_subscription_id,
            )

            if new_plan == "free":
                logger.info(f"User {user.id} subscription deactivated due to payment failure (no active subscriptions remaining)")
            else:
                logger.info(f"User {user.id} subscription payment failed (other active subscriptions remain)")
            
            return {
                "status": "success",
                "user_id": user.id,
                "deleted_videos": result.get("deleted_videos", 0),
            }
        except user_model.DoesNotExist:
            logger.error(f"User with customer_id {customer_id} not found")
            return {"status": "error", "message": "User not found"}
        except Exception as e:
            logger.error(f"Error handling invoice payment failed: {e}")
            raise
