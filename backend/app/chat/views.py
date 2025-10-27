from app.utils.mixins import AuthenticatedViewMixin
from app.utils.responses import create_error_response
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from rest_framework import generics, status
from rest_framework.response import Response

from .langchain_utils import get_langchain_llm, handle_langchain_exception


class ChatView(AuthenticatedViewMixin, generics.CreateAPIView):
    """チャットビュー（LangChain使用）"""

    def post(self, request):
        user = request.user

        # LangChainのLLMを取得
        llm, error_response = get_langchain_llm(user)
        if error_response:
            return error_response

        # メッセージを検証
        messages = request.data.get("messages", [])
        if not messages:
            return create_error_response(
                "メッセージが空です", status.HTTP_400_BAD_REQUEST
            )

        try:
            # LangChainのメッセージ形式に変換
            langchain_messages = []
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")

                if role == "system":
                    langchain_messages.append(SystemMessage(content=content))
                elif role == "user":
                    langchain_messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    langchain_messages.append(AIMessage(content=content))

            # LangChainでチャット補完を実行
            response = llm.invoke(langchain_messages)

            return Response(
                {
                    "role": "assistant",
                    "content": response.content,
                }
            )

        except Exception as e:
            return handle_langchain_exception(e)
