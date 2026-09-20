import pytest
from rest_framework.test import APIClient

from accounts.models import UserProfile
from django.contrib.auth.models import User


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