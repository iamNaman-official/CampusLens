from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.utils import timezone

from accounts.models import PasswordResetOTP
from accounts.services.email_otp import MAX_OTP_ATTEMPTS, generate_otp


def send_password_reset_otp(user: User):
    otp = generate_otp()
    PasswordResetOTP.objects.filter(user=user).delete()
    PasswordResetOTP.objects.create(
        user=user,
        otp_hash=PasswordResetOTP.hash_otp(otp),
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    send_mail(
        subject="CampusLens Password Reset OTP",
        message=(f"Your CampusLens password reset code is: {otp}\n\n"
                 "This code expires in 5 minutes. If you did not request it, ignore this email."),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def request_password_reset(email: str):
    user = User.objects.filter(email__iexact=email).first()
    if not user:
        return True, "If an account exists for this email, a reset code has been sent.", None
    record = PasswordResetOTP.objects.filter(user=user).order_by("-created_at").first()
    if record and not record.can_resend():
        return False, "Please wait before requesting another reset code.", record.resend_available_in()
    send_password_reset_otp(user)
    return True, "If an account exists for this email, a reset code has been sent.", None


def confirm_password_reset(email: str, otp: str, password: str):
    user = User.objects.filter(email__iexact=email).first()
    if not user:
        return False, "Invalid reset code."
    record = PasswordResetOTP.objects.filter(user=user).order_by("-created_at").first()
    if not record:
        return False, "No reset code found. Please request a new code."
    if record.is_expired():
        record.delete()
        return False, "Reset code has expired. Please request a new code."
    if record.attempts >= MAX_OTP_ATTEMPTS:
        record.delete()
        return False, "Too many attempts. Please request a new code."
    record.attempts += 1
    record.save(update_fields=["attempts"])
    if record.otp_hash != PasswordResetOTP.hash_otp(otp):
        return False, "Invalid reset code."
    user.set_password(password)
    user.save(update_fields=["password"])
    record.delete()
    return True, "Password reset successfully. You can now sign in."
