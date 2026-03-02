from app.auth.use_cases import (GetCurrentUserQuery, PasswordResetConfirmCommand,
                                PasswordResetRequestCommand, SignupCommand,
                                VerifyEmailCommand)


class SignupUserAdapter:
    def __init__(self, *, user_model, send_verification_email, signup_user_creator):
        self._user_model = user_model
        self._send_verification_email = send_verification_email
        self._signup_user_creator = signup_user_creator

    def __call__(self, command: SignupCommand):
        return self._signup_user_creator(
            user_model=self._user_model,
            validated_data={
                "username": command.username,
                "email": command.email,
                "password": command.password,
            },
            send_verification_email=self._send_verification_email,
        )


class VerifyEmailAdapter:
    def __init__(self, *, user_model, email_verification_resolver, user_activator):
        self._user_model = user_model
        self._email_verification_resolver = email_verification_resolver
        self._user_activator = user_activator

    def __call__(self, command: VerifyEmailCommand):
        user = self._email_verification_resolver(
            user_model=self._user_model,
            uid=command.uid,
            token=command.token,
        )
        return self._user_activator(user)


class PasswordResetRequestAdapter:
    def __init__(self, *, user_model, send_reset_email, password_reset_requester):
        self._user_model = user_model
        self._send_reset_email = send_reset_email
        self._password_reset_requester = password_reset_requester

    def __call__(self, command: PasswordResetRequestCommand):
        return self._password_reset_requester(
            user_model=self._user_model,
            email=command.email,
            send_reset_email=self._send_reset_email,
        )


class PasswordResetConfirmAdapter:
    def __init__(
        self,
        *,
        user_model,
        password_reset_resolver,
        password_reset_confirmer,
    ):
        self._user_model = user_model
        self._password_reset_resolver = password_reset_resolver
        self._password_reset_confirmer = password_reset_confirmer

    def __call__(self, command: PasswordResetConfirmCommand):
        user = self._password_reset_resolver(
            user_model=self._user_model,
            uid=command.uid,
            token=command.token,
            new_password=command.new_password,
        )
        return self._password_reset_confirmer(
            user=user,
            new_password=command.new_password,
        )


class CurrentUserAdapter:
    def __init__(self, *, user_model, current_user_loader):
        self._user_model = user_model
        self._current_user_loader = current_user_loader

    def __call__(self, query: GetCurrentUserQuery):
        return self._current_user_loader(user_model=self._user_model, user_id=query.user_id)
