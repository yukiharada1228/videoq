"""Common modules shared across the application"""

from .authentication import CookieJWTAuthentication
from .permissions import (IsAuthenticatedOrSharedAccess,
                          ShareTokenAuthentication)
from .responses import (create_created_response, create_error_response,
                        create_no_content_response, create_success_response)
from .throttles import (AuthenticatedChatThrottle, LoginIPThrottle,
                        LoginUsernameThrottle, PasswordResetEmailThrottle,
                        PasswordResetIPThrottle, ShareTokenGlobalThrottle,
                        ShareTokenIPThrottle, SignupIPThrottle)

__all__ = [
    "CookieJWTAuthentication",
    "IsAuthenticatedOrSharedAccess",
    "ShareTokenAuthentication",
    "create_error_response",
    "create_success_response",
    "create_created_response",
    "create_no_content_response",
    "ShareTokenIPThrottle",
    "ShareTokenGlobalThrottle",
    "AuthenticatedChatThrottle",
    "LoginIPThrottle",
    "LoginUsernameThrottle",
    "SignupIPThrottle",
    "PasswordResetIPThrottle",
    "PasswordResetEmailThrottle",
]
