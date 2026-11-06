"""Interactive login probe; never sends messages or prints credentials."""
import getpass
import hashlib
import json
import logging
import os
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import TwoFactorRequired

logging.disable(logging.CRITICAL)
client = Client()
client.request_timeout = 20

def verification_code(*args):
    print('{"status":"verification_code_required"}', flush=True)
    return getpass.getpass("Instagram code (hidden): ")

client.challenge_code_handler = verification_code
username = os.environ["INSTAGRAM_USERNAME"].strip()
password = os.environ["INSTAGRAM_PASSWORD"]
identity = hashlib.sha256(username.lower().encode()).hexdigest()[:24]
session = Path("/state") / identity / "session.json"
try:
    if session.exists():
        client.load_settings(session)
    try:
        client.login(username, password)
    except TwoFactorRequired:
        code = verification_code()
        client.login(username, password, verification_code=code)
    session.parent.mkdir(parents=True, exist_ok=True)
    client.dump_settings(session)
    session.chmod(0o600)
    print(json.dumps({"status": "login_succeeded", "message_sent": False}), flush=True)
except Exception as error:
    print(json.dumps({"status": "login_stopped", "error_type": type(error).__name__,
                      "automatic_retry": False, "message_sent": False}), flush=True)
