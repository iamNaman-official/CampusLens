from django.urls import path

from .views import (
    EmailVerifiedTokenObtainPairView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    ResendOTPView,
    VerifyOTPView,
)

urlpatterns = [
    path(
        "register/",
        RegisterView.as_view(),
        name="register",
    ),
    path(
        "otp/verify/",
        VerifyOTPView.as_view(),
        name="verify-otp",
    ),
    path(
        "otp/resend/",
        ResendOTPView.as_view(),
        name="resend-otp",
    ),
    path("password/reset/request/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password/reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path(
        "token/",
        EmailVerifiedTokenObtainPairView.as_view(),
        name="token",
    ),
    path(
        "me/",
        MeView.as_view(),
        name="me",
    ),
]
