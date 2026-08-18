"""
ClassPulse AI — Stripe Subscription Service
Handles: checkout sessions, webhooks, customer portal, plan limits enforcement
"""
import os
from typing import Optional

try:
    import stripe
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_AVAILABLE = True
except ImportError:
    stripe = None
    STRIPE_AVAILABLE = False

# Price IDs — configure in .env or Stripe Dashboard
PRICE_PRO_MONTHLY       = os.getenv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_monthly")
PRICE_PRO_ANNUAL        = os.getenv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual")
PRICE_INSTITUTE_MONTHLY = os.getenv("STRIPE_PRICE_INSTITUTE_MONTHLY", "price_institute_monthly")
PRICE_INSTITUTE_ANNUAL  = os.getenv("STRIPE_PRICE_INSTITUTE_ANNUAL", "price_institute_annual")

# Plan limits configuration (Zoom-style Free tier + Pro + Institute)
PLAN_LIMITS = {
    "free": {
        "name": "Free",
        "max_students_per_room": 10,
        "session_minutes": 40,
        "ai_analyses_per_day": 3,
        "storage_gb": 1,
        "whiteboard": True,
        "breakout_rooms": False,
        "recording": False,
        "file_sharing": True,
        "admin_panel": False,
    },
    "pro": {
        "name": "Pro",
        "max_students_per_room": 500,
        "session_minutes": 99999,
        "ai_analyses_per_day": 99999,
        "storage_gb": 10,
        "whiteboard": True,
        "breakout_rooms": True,
        "recording": True,
        "file_sharing": True,
        "admin_panel": False,
    },
    "institute": {
        "name": "Institute",
        "max_students_per_room": 500,
        "session_minutes": 99999,
        "ai_analyses_per_day": 99999,
        "storage_gb": 50,
        "whiteboard": True,
        "breakout_rooms": True,
        "recording": True,
        "file_sharing": True,
        "admin_panel": True,
        "team_seats": 5,
    },
    "enterprise": {
        "name": "Enterprise",
        "max_students_per_room": 1000,
        "session_minutes": 99999,
        "ai_analyses_per_day": 99999,
        "storage_gb": 500,
        "whiteboard": True,
        "breakout_rooms": True,
        "recording": True,
        "file_sharing": True,
        "admin_panel": True,
        "white_label": True,
    },
}


def get_plan_limits(plan: str) -> dict:
    return PLAN_LIMITS.get(plan.lower(), PLAN_LIMITS["free"])


def create_checkout_session(
    customer_email: str,
    price_id: str,
    success_url: str,
    cancel_url: str,
    clerk_user_id: str,
    trial_days: int = 14,
) -> Optional[str]:
    """Create a Stripe Checkout session and return the redirect URL."""
    if not STRIPE_AVAILABLE or not stripe.api_key or stripe.api_key.startswith("sk_test_your"):
        # Simulated checkout URL in development mode
        return f"{success_url}&simulated=true&clerk_user_id={clerk_user_id}&price_id={price_id}"

    try:
        session_params = {
            "customer_email": customer_email,
            "payment_method_types": ["card"],
            "line_items": [{"price": price_id, "quantity": 1}],
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": {"clerk_user_id": clerk_user_id},
            "allow_promotion_codes": True,
        }
        if trial_days > 0:
            session_params["subscription_data"] = {"trial_period_days": trial_days}

        session = stripe.checkout.Session.create(**session_params)
        return session.url
    except Exception as e:
        print(f"[Stripe] Checkout creation error: {e}")
        return None


def create_portal_session(customer_id: str, return_url: str) -> Optional[str]:
    """Create a Stripe Customer Portal session and return the redirect URL."""
    if not STRIPE_AVAILABLE or not stripe.api_key or stripe.api_key.startswith("sk_test_your"):
        return return_url

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return session.url
    except Exception as e:
        print(f"[Stripe] Portal creation error: {e}")
        return None


def handle_webhook(payload: bytes, sig_header: str) -> dict:
    """Verify and parse incoming Stripe webhook payload."""
    if not STRIPE_AVAILABLE or not stripe:
        return {"error": "Stripe library not installed"}

    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        return {"error": "STRIPE_WEBHOOK_SECRET not set"}

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        return {"type": event["type"], "data": event["data"]["object"]}
    except Exception as e:
        return {"error": str(e)}
