import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.utils import timezone

from accounts.models import EmailOTP

OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


def generate_otp():
    """Generate a secure 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def send_email_otp(user: User):
    """
    Generate and send a new email verification OTP.

    Any existing OTP is invalidated.
    """

    otp = generate_otp()

    EmailOTP.objects.filter(user=user).delete()

    EmailOTP.objects.create(
        user=user,
        otp_hash=EmailOTP.hash_otp(otp),
        expires_at=(
                timezone.now()
                + timedelta(minutes=OTP_EXPIRY_MINUTES)
        ),
    )

    send_mail(
        subject="CampusLens Email Verification OTP",
        message=(
            f"Your CampusLens verification code is: {otp}\n\n"
            f"This OTP expires in {OTP_EXPIRY_MINUTES} minutes.\n\n"
            "If you did not request this code, you can ignore "
            "this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def resend_email_otp(user: User):
    """
    Resend an email verification OTP.

    Returns:
        tuple[bool, str, int | None]
    """

    if user.profile.email_verified:
        return (
            False,
            "Email is already verified.",
            None,
        )

    existing_otp = (
        EmailOTP.objects
        .filter(user=user)
        .order_by("-created_at")
        .first()
    )

    if existing_otp and not existing_otp.can_resend():
        retry_after = existing_otp.resend_available_in()

        return (
            False,
            "Please wait before requesting another OTP.",
            retry_after,
        )

    send_email_otp(user)

    return (
        True,
        "A new OTP has been sent to your email.",
        None,
    )


def verify_email_otp(user: User, otp: str):
    """
    Verify the latest OTP belonging to a user.

    Returns:
        tuple[bool, str]
    """

    otp_record = (
        EmailOTP.objects
        .filter(user=user)
        .order_by("-created_at")
        .first()
    )

    if not otp_record:
        return (
            False,
            "No OTP found. Please request a new OTP.",
        )

    if otp_record.is_expired():
        otp_record.delete()

        return (
            False,
            "OTP has expired. Please request a new OTP.",
        )

    if otp_record.attempts >= MAX_OTP_ATTEMPTS:
        otp_record.delete()

        return (
            False,
            "Too many attempts. Please request a new OTP.",
        )

    otp_record.attempts += 1
    otp_record.save(
        update_fields=["attempts"]
    )

    if otp_record.otp_hash != EmailOTP.hash_otp(otp):
        return (
            False,
            "Invalid OTP.",
        )

    user.profile.email_verified = True
    user.profile.save(
        update_fields=[
            "email_verified",
            "updated_at",
        ]
    )

    otp_record.delete()

    return (
        True,
        "Email verified successfully.",
    )