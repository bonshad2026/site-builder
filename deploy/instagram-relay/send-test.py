"""Send one labelled test using the verified sender session."""
import hashlib
import json
import logging
import os
from pathlib import Path
from instagrapi import Client

logging.disable(logging.CRITICAL)
username = os.environ["INSTAGRAM_USERNAME"].strip()
recipient = os.environ.get("INSTAGRAM_RECIPIENT", "_mehdi__hamze").lstrip("@")
if recipient != "_mehdi__hamze":
    raise SystemExit("Recipient differs from the approved test target.")
identity = hashlib.sha256(username.lower().encode()).hexdigest()[:24]
session = Path("/state") / identity / "session.json"
if not session.exists():
    raise SystemExit("Verified sender session is missing; no login or send attempted.")
client = Client()
client.request_timeout = 20
stage = "session_validation"
try:
    client.load_settings(session)
    client.account_info()
    stage = "recipient_lookup"
    recipient_id = client.user_id_from_username(recipient)
    stage = "send"
    result = client.direct_send(
        "Cafe Mohammad order-system connection test. This is not a real order.",
        user_ids=[recipient_id],
    )
    client.dump_settings(session)
    print(json.dumps({"status": "accepted_by_instagram" if getattr(result, "id", None) else "unknown_send_result",
                      "recipient": recipient, "automatic_retry": False}), flush=True)
except Exception as error:
    print(json.dumps({"status": "stopped", "stage": stage,
                      "error_type": type(error).__name__, "automatic_retry": False}), flush=True)
