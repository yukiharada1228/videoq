from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
import openai
from django.contrib.auth import get_user_model
from app.utils.encryption import decrypt_api_key
from typing import Tuple

User = get_user_model()


def create_error_response(message: str, status_code: int) -> Response:
    """エラーレスポンスを作成する共通ヘルパー"""
    return Response({"error": message}, status=status_code)


def get_openai_client(user) -> Tuple[openai.OpenAI, Response]:
    """
    OpenAIクライアントを取得する共通ヘルパー
    
    Returns:
        Tuple[OpenAI, Response]: (クライアント, エラーレスポンス)
                                成功した場合、エラーレスポンスはNone
    """
    if not user.encrypted_openai_api_key:
        return None, create_error_response(
            "OpenAI APIキーが設定されていません",
            status.HTTP_400_BAD_REQUEST
        )
    
    try:
        api_key = decrypt_api_key(user.encrypted_openai_api_key)
    except Exception as e:
        return None, create_error_response(
            f"APIキーの復号化に失敗しました: {str(e)}",
            status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    return openai.OpenAI(api_key=api_key), None


def handle_openai_exception(exception: Exception) -> Response:
    """OpenAI APIの例外をハンドリングする共通ヘルパー"""
    if isinstance(exception, openai.AuthenticationError):
        return create_error_response("無効なAPIキーです", status.HTTP_401_UNAUTHORIZED)
    elif isinstance(exception, openai.RateLimitError):
        return create_error_response("APIのレート制限に達しました", status.HTTP_429_TOO_MANY_REQUESTS)
    else:
        return create_error_response(f"OpenAI APIエラー: {str(exception)}", status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChatView(generics.CreateAPIView):
    """チャットビュー"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def post(self, request):
        user = request.user
        
        # OpenAIクライアントを取得
        client, error_response = get_openai_client(user)
        if error_response:
            return error_response

        # メッセージを検証
        messages = request.data.get("messages", [])
        if not messages:
            return create_error_response("メッセージが空です", status.HTTP_400_BAD_REQUEST)

        try:
            # チャット補完を実行
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": msg.get("role", "user"), "content": msg.get("content", "")}
                    for msg in messages
                ],
            )

            return Response({
                "role": "assistant",
                "content": response.choices[0].message.content,
            })

        except Exception as e:
            return handle_openai_exception(e)

