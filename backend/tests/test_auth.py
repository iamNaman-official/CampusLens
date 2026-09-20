from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import PasswordResetOTP, UserProfile
from accounts.services.email_otp import MAX_OTP_ATTEMPTS


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()


@pytest.mark.django_db
def test_register_user():
    client = APIClient()

    response = client.post(
        "/api/auth/register/",
        {
            "username": "newstudent",
            "email": "newstudent@example.com",
            "password": "TestPassword123!",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["user"]["username"] == "newstudent"
    assert response.data["user"]["email"] == "newstudent@example.com"
    assert response.data["email_verified"] is False


@pytest.mark.django_db
def test_login_user():
    user = User.objects.create_user(
        username="teststudent",
        email="teststudent@example.com",
        password="TestPassword123!",
    )

    UserProfile.objects.create(
        user=user,
        email_verified=True,
    )

    client = APIClient()

    response = client.post(
        "/api/auth/token/",
        {
            "username": "teststudent",
            "password": "TestPassword123!",
        },
        format="json",
    )

    assert response.status_code == 200
    assert "access" in response.data
    assert "refresh" in response.data

    refresh_response = client.post(
        "/api/auth/token/refresh/",
        {"refresh": response.data["refresh"]},
        format="json",
    )
    assert refresh_response.status_code == 200
    assert "access" in refresh_response.data

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    me_response = client.get("/api/auth/me/")
    assert me_response.status_code == 200
    assert me_response.data["username"] == user.username


@pytest.mark.django_db
def test_login_unverified_user():
    user = User.objects.create_user(
        username="unverified",
        email="unverified@example.com",
        password="TestPassword123!",
    )

    UserProfile.objects.create(
        user=user,
        email_verified=False,
    )

    client = APIClient()

    response = client.post(
        "/api/auth/token/",
        {
            "username": "unverified",
            "password": "TestPassword123!",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["non_field_errors"] == [
        "Please verify your email before logging in."
    ]


@pytest.mark.django_db
def test_password_reset_with_email_otp(monkeypatch):
    user = User.objects.create_user(
        username="resetstudent",
        email="reset@example.com",
        password="OldPassword123!",
    )
    UserProfile.objects.create(user=user, email_verified=True)

    monkeypatch.setattr(
        "accounts.services.password_reset.generate_otp",
        lambda: "123456",
    )

    client = APIClient()
    request_response = client.post(
        "/api/auth/password/reset/request/",
        {"email": user.email},
        format="json",
    )
    assert request_response.status_code == 200
    assert PasswordResetOTP.objects.filter(user=user).exists()

    confirm_response = client.post(
        "/api/auth/password/reset/confirm/",
        {
            "email": user.email,
            "otp": "123456",
            "password": "NewPassword123!",
        },
        format="json",
    )
    assert confirm_response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("NewPassword123!")
    assert not PasswordResetOTP.objects.filter(user=user).exists()


@pytest.fixture
def reset_user():
    user = User.objects.create_user(
        username="resetuser",
        email="resetuser@example.com",
        password="OldPassword123!",
    )
    UserProfile.objects.create(user=user, email_verified=True)
    return user


@pytest.mark.django_db
def test_password_reset_request_is_generic_and_throttled(reset_user):
    client = APIClient()
    existing = client.post(
        "/api/auth/password/reset/request/",
        {"email": reset_user.email},
        format="json",
    )
    missing = client.post(
        "/api/auth/password/reset/request/",
        {"email": "missing@example.com"},
        format="json",
    )
    throttled = client.post(
        "/api/auth/password/reset/request/",
        {"email": reset_user.email},
        format="json",
    )
    assert existing.status_code == missing.status_code == 200
    assert existing.data["detail"] == missing.data["detail"]
    assert throttled.status_code == 429
    assert throttled.data["retry_after"] > 0


@pytest.mark.django_db
def test_expired_or_invalid_password_reset_otp_cannot_reset(reset_user):
    client = APIClient()
    expired = PasswordResetOTP.objects.create(
        user=reset_user,
        otp_hash=PasswordResetOTP.hash_otp("123456"),
        expires_at=timezone.now() - timedelta(seconds=1),
    )
    response = client.post(
        "/api/auth/password/reset/confirm/",
        {"email": reset_user.email, "otp": "123456", "password": "NewPassword123!"},
        format="json",
    )
    assert response.status_code == 400
    assert "expired" in response.data["detail"].lower()
    assert not PasswordResetOTP.objects.filter(pk=expired.pk).exists()
    reset_user.refresh_from_db()
    assert reset_user.check_password("OldPassword123!")


@pytest.mark.django_db
def test_password_reset_attempt_limit_and_password_validation(reset_user):
    client = APIClient()
    record = PasswordResetOTP.objects.create(
        user=reset_user,
        otp_hash=PasswordResetOTP.hash_otp("123456"),
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    for _ in range(MAX_OTP_ATTEMPTS):
        response = client.post(
            "/api/auth/password/reset/confirm/",
            {"email": reset_user.email, "otp": "000000", "password": "NewPassword123!"},
            format="json",
        )
        assert response.status_code == 400
    locked = client.post(
        "/api/auth/password/reset/confirm/",
        {"email": reset_user.email, "otp": "123456", "password": "NewPassword123!"},
        format="json",
    )
    weak_password = client.post(
        "/api/auth/password/reset/confirm/",
        {"email": reset_user.email, "otp": "123456", "password": "short"},
        format="json",
    )
    assert locked.status_code == 400
    assert "too many attempts" in locked.data["detail"].lower()
    assert weak_password.status_code == 400
    assert not PasswordResetOTP.objects.filter(pk=record.pk).exists()
