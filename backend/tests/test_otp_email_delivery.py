from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from accounts.models import EmailOTP, PasswordResetOTP, UserProfile
from accounts.services import email_otp, password_reset


@pytest.mark.django_db
@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="noreply@example.test",
)
def test_verification_otp_is_sent_by_configured_django_backend(monkeypatch):
    user = User.objects.create_user(
        username="student",
        email="student@example.test",
        password="TestPassword123!",
    )
    UserProfile.objects.create(user=user)
    monkeypatch.setattr(email_otp, "generate_otp", lambda: "123456")

    email_otp.send_email_otp(user)

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["student@example.test"]
    assert mail.outbox[0].from_email == "noreply@example.test"
    assert "123456" in mail.outbox[0].body
    record = EmailOTP.objects.get(user=user)
    assert record.otp_hash != "123456"


@pytest.mark.django_db
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_password_reset_otp_is_sent_without_exposing_value_from_service(monkeypatch):
    user = User.objects.create_user(
        username="resetstudent",
        email="reset@example.test",
        password="TestPassword123!",
    )
    UserProfile.objects.create(user=user, email_verified=True)
    monkeypatch.setattr(password_reset, "generate_otp", lambda: "654321")

    password_reset.send_password_reset_otp(user)

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["reset@example.test"]
    record = PasswordResetOTP.objects.get(user=user)
    assert record.otp_hash != "654321"
    assert record.expires_at > timezone.now() + timedelta(minutes=4)
