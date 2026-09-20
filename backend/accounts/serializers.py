from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import UserProfile


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        min_length=8,
    )

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "password",
        ]

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "A user with this username already exists."
            )

        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "A user with this email already exists."
            )

        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )

        UserProfile.objects.create(
            user=user,
        )

        return user


class UserSerializer(serializers.ModelSerializer):
    email_verified = serializers.BooleanField(
        source="profile.email_verified",
        read_only=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "email_verified",
        ]
        read_only_fields = [
            "id",
            "username",
            "email",
            "email_verified",
        ]


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(
        min_length=6,
        max_length=6,
    )

    def validate_otp(self, value):
        if not value.isdigit():
            raise serializers.ValidationError(
                "OTP must contain only digits."
            )

        return value


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(min_length=6, max_length=6)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_otp(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("OTP must contain only digits.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value


class EmailVerifiedTokenObtainPairSerializer(
    TokenObtainPairSerializer
):
    def validate(self, attrs):
        data = super().validate(attrs)

        if not self.user.profile.email_verified:
            raise serializers.ValidationError(
                "Please verify your email before logging in."
            )

        return data
