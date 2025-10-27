from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
import openai
from django.contrib.auth import get_user_model
from app.utils.encryption import decrypt_api_key

User = get_user_model()


class ChatView(generics.CreateAPIView):
    """チャットビュー"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def post(self, request):
        user = request.user

        # ユーザーのAPIキーを確認
        if not user.encrypted_openai_api_key:
            return Response(
                {"error": "OpenAI APIキーが設定されていません"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 暗号化されたAPIキーを復号化
        try:
            api_key = decrypt_api_key(user.encrypted_openai_api_key)
        except Exception as e:
            return Response(
                {"error": f"APIキーの復号化に失敗しました: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # メッセージを取得
        messages = request.data.get("messages", [])

        if not messages:
            return Response(
                {"error": "メッセージが空です"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # OpenAIクライアントを初期化
            client = openai.OpenAI(api_key=api_key)

            # チャット補完を実行
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": msg.get("role", "user"), "content": msg.get("content", "")}
                    for msg in messages
                ],
            )

            # レスポンスを返す
            return Response(
                {
                    "role": "assistant",
                    "content": response.choices[0].message.content,
                }
            )

        except openai.AuthenticationError:
            return Response(
                {"error": "無効なAPIキーです"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except openai.RateLimitError:
            return Response(
                {"error": "APIのレート制限に達しました"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except Exception as e:
            return Response(
                {"error": f"OpenAI APIエラー: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

