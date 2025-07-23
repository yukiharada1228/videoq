import json
from django.http import HttpResponse, JsonResponse
from django.conf import settings
from .share_access_service import ShareAccessService


class ShareAccessMiddleware:
    """共有URLアクセス時の同時アクセス制限を処理するミドルウェア"""
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.access_service = ShareAccessService()
    
    def __call__(self, request):
        # 共有URLパターンをチェック
        if self._is_share_url(request.path):
            share_token = self._extract_share_token(request.path)
            if share_token:
                return self._handle_share_access(request, share_token)
        
        response = self.get_response(request)
        return response
    
    def _is_share_url(self, path: str) -> bool:
        """共有URLかどうかを判定"""
        share_patterns = [
            '/share/group/',
            '/share/group/',
        ]
        return any(pattern in path for pattern in share_patterns)
    
    def _extract_share_token(self, path: str) -> str:
        """URLからshare_tokenを抽出"""
        try:
            # /share/group/{share_token}/ の形式から抽出
            parts = path.split('/')
            if len(parts) >= 4 and parts[1] == 'share' and parts[2] == 'group':
                return parts[3]
        except (IndexError, AttributeError):
            pass
        return None
    
    def _handle_share_access(self, request, share_token: str):
        """共有アクセスの処理"""
        # セッションIDを取得（クッキーまたはヘッダーから）
        session_id = self._get_session_id(request)
        
        if session_id:
            # 既存セッションの更新
            if self.access_service.update_session_activity(share_token, session_id):
                response = self.get_response(request)
                return response
            else:
                # セッションが無効になった場合、新しいセッションを登録
                pass
        
        # 新しいセッションを登録
        success, new_session_id, error_message = self.access_service.register_session(share_token)
        
        if not success:
            # 制限に達した場合
            if request.headers.get('Content-Type') == 'application/json':
                return JsonResponse({
                    'error': error_message,
                    'max_concurrent_users': self.access_service.get_max_concurrent_users(),
                    'current_active_count': self.access_service.get_current_active_count(share_token)
                }, status=429)
            else:
                return HttpResponse(
                    f"""
                    <html>
                    <head><title>アクセス制限</title></head>
                    <body>
                        <h1>アクセス制限</h1>
                        <p>{error_message}</p>
                        <p>現在の同時アクセス数: {self.access_service.get_current_active_count(share_token)}/{self.access_service.get_max_concurrent_users()}</p>
                    </body>
                    </html>
                    """,
                    status=429,
                    content_type='text/html; charset=utf-8'
                )
        
        # セッションIDをレスポンスに設定
        response = self.get_response(request)
        response.set_cookie(
            'share_session_id',
            new_session_id,
            max_age=self.access_service.session_timeout_seconds,
            httponly=True,
            samesite='Lax'
        )
        
        return response
    
    def _get_session_id(self, request) -> str:
        """リクエストからセッションIDを取得"""
        # クッキーから取得
        session_id = request.COOKIES.get('share_session_id')
        if session_id:
            return session_id
        
        # ヘッダーから取得（APIリクエスト用）
        session_id = request.headers.get('X-Share-Session-ID')
        if session_id:
            return session_id
        
        return None
    
    def process_response(self, request, response):
        """レスポンス処理"""
        # 共有URLからのリクエストで、セッションIDが設定されている場合
        if self._is_share_url(request.path):
            share_token = self._extract_share_token(request.path)
            session_id = self._get_session_id(request)
            
            if share_token and session_id:
                # セッションIDをレスポンスヘッダーに追加（API用）
                response['X-Share-Session-ID'] = session_id
        
        return response 