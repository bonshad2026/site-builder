"""One-message feasibility probe, disconnected from orders."""
import argparse
import getpass
import json
import logging
import os
from pathlib import Path
import re
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--send-test", action="store_true")
    args = parser.parse_args()
    recipient = os.getenv("INSTAGRAM_RECIPIENT", "_mehdi__hamze").lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", recipient):
        print('{"status":"invalid_recipient"}')
        return 2
    from instagrapi import Client
    if not args.send_test:
        print(json.dumps({"status": "dry_run", "recipient": recipient,
                          "library_import": "ok", "network_calls": 0}))
        return 0
    username = os.getenv("INSTAGRAM_USERNAME", "").strip()
    password = os.getenv("INSTAGRAM_PASSWORD", "")
    if not username or not password:
        print('{"status":"missing_credentials"}')
        return 2
    logging.disable(logging.CRITICAL)
    client = Client()
    client.request_timeout = 20
    client.challenge_code_handler = lambda *_: getpass.getpass("Instagram verification code (hidden): ")
    session_file = Path("/state/session.json")
    try:
        if session_file.exists():
            client.load_settings(session_file)
        code = getpass.getpass("Two-factor code if enabled (Enter to skip): ") if sys.stdin.isatty() else ""
        client.login(username, password, verification_code=code)
        session_file.parent.mkdir(parents=True, exist_ok=True)
        client.dump_settings(session_file)
        session_file.chmod(0o600)
        recipient_id = client.user_id_from_username(recipient)
        message = "Cafe Mohammad order-system connection test. This is not a real order."
        result = client.direct_send(message, user_ids=[recipient_id])
        client.dump_settings(session_file)
        if not getattr(result, "id", None):
            print('{"status":"unknown_send_result","automatic_retry":false}')
            return 3
        print(json.dumps({"status": "accepted_by_instagram", "recipient": recipient}))
        return 0
    except Exception as error:
        # Exception text and HTTP responses may contain credentials.
        print(json.dumps({"status": "stopped", "error_type": type(error).__name__,
                          "automatic_retry": False}))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
