import hashlib

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class UserProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    email_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} Profile"


class EmailOTP(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="email_otps",
    )
    otp_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    @staticmethod
    def hash_otp(otp):
        return hashlib.sha256(
            otp.encode("utf-8")
        ).hexdigest()

    def is_expired(self):
        return timezone.now() >= self.expires_at

    def can_resend(self):
        cooldown_seconds = 60
        elapsed_seconds = (
                timezone.now() - self.created_at
        ).total_seconds()

        return elapsed_seconds >= cooldown_seconds

    def resend_available_in(self):
        cooldown_seconds = 60
        elapsed_seconds = (
                timezone.now() - self.created_at
        ).total_seconds()

        remaining = cooldown_seconds - elapsed_seconds

        return max(0, int(remaining))

    def __str__(self):
        return f"OTP for {self.user.username}"