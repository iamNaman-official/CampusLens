from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    EmailVerifiedTokenObtainPairSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    ResendOTPSerializer,
    UserSerializer,
    VerifyOTPSerializer,
)
from .services.email_otp import (
    resend_email_otp,
    send_email_otp,
    verify_email_otp,
)
from .services.password_reset import (
    confirm_password_reset,
    request_password_reset,
)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.save()

            send_email_otp(user)

            return Response(
                {
                    "detail": (
                        "Registration successful. "
                        "Please verify your email."
                    ),
                    "user": UserSerializer(user).data,
                    "email_verified": user.profile.email_verified,
                },
                status=status.HTTP_201_CREATED,
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]
        otp = serializer.validated_data["otp"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {
                    "detail": "No account found with this email."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.profile.email_verified:
            return Response(
                {
                    "detail": "Email is already verified.",
                    "email_verified": True,
                },
                status=status.HTTP_200_OK,
            )

        success, message = verify_email_otp(
            user,
            otp,
        )

        if not success:
            return Response(
                {
                    "detail": message,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "detail": message,
                "email_verified": True,
            },
            status=status.HTTP_200_OK,
        )


class ResendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {
                    "detail": "No account found with this email."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        success, message, retry_after = resend_email_otp(user)

        if not success:
            response_data = {
                "detail": message,
            }

            if retry_after is not None:
                response_data["retry_after"] = retry_after

                return Response(
                    response_data,
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            return Response(
                response_data,
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "detail": message,
            },
            status=status.HTTP_200_OK,
        )


class EmailVerifiedTokenObtainPairView(
    TokenObtainPairView
):
    serializer_class = EmailVerifiedTokenObtainPairSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)

        return Response(serializer.data)

    def patch(self, request):
        serializer = UserSerializer(
            request.user,
            data=request.data,
            partial=True,
        )

        if serializer.is_valid():
            serializer.save()

            return Response(
                serializer.data,
                status=status.HTTP_200_OK,
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        success, message, retry_after = request_password_reset(
            serializer.validated_data["email"],
        )
        if not success:
            return Response(
                {"detail": message, "retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return Response({"detail": message})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        success, message = confirm_password_reset(
            serializer.validated_data["email"],
            serializer.validated_data["otp"],
            serializer.validated_data["password"],
        )
        if not success:
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": message})
