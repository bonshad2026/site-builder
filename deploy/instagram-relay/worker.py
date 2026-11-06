"""Tenant-local encrypted Instagram connection and durable delivery worker."""
import base64
import json
import logging
import os
import time
import psycopg
from psycopg.rows import dict_row
from Cryptodome.Cipher import AES
from instagrapi import Client
from instagrapi.exceptions import TwoFactorRequired

logging.disable(logging.CRITICAL)
KEY=base64.b64decode(os.environ["RELAY_SECRETS_KEY"])
def decode(payload):
    iv,tag,data=[base64.b64decode(p) for p in payload.split(".")]
    return AES.new(KEY,AES.MODE_GCM,nonce=iv).decrypt_and_verify(data,tag).decode()
def encode(plain):
    cipher=AES.new(KEY,AES.MODE_GCM,nonce=os.urandom(12))
    data,tag=cipher.encrypt_and_digest(plain.encode())
    return ".".join(base64.b64encode(v).decode() for v in (cipher.nonce,tag,data))
def report(status,**fields):
    print(json.dumps({"status":status,**fields}),flush=True)

def main():
    with psycopg.connect(os.environ["RELAY_DATABASE_URL"],autocommit=True,row_factory=dict_row) as db:
        if not db.execute("SELECT pg_try_advisory_lock(8725001) AS acquired").fetchone()["acquired"]:
            report("worker_already_running"); return
        db.execute("UPDATE instagram_outbox SET state='unknown',error_code='worker_interrupted',updated_at=now() WHERE state='sending'")
        db.execute("UPDATE instagram_connection SET status='error',error_code='worker_interrupted',action='none',code_enc=NULL WHERE status IN ('connecting','code_required')")
        client=None
        active_version=None
        report("ready")
        while True:
            db.execute("UPDATE instagram_connection SET heartbeat_at=now() WHERE id=1")
            config=db.execute("SELECT * FROM instagram_connection WHERE id=1").fetchone()
            version=config["version"]
            def update(status,error=None,session=None):
                db.execute("UPDATE instagram_connection SET status=%s,error_code=%s,session_enc=%s,action='none',code_enc=NULL,updated_at=now() WHERE id=1 AND version=%s",
                  (status,error,session,version))
            def get_code(*args):
                db.execute("UPDATE instagram_connection SET status='code_required',code_enc=NULL WHERE id=1 AND version=%s",(version,))
                deadline=time.monotonic()+300
                while time.monotonic()<deadline:
                    current=db.execute("UPDATE instagram_connection SET heartbeat_at=now() WHERE id=1 RETURNING code_enc,version,status").fetchone()
                    if current["version"]!=version or current["status"]!="code_required":
                        raise RuntimeError("LoginCancelled")
                    if current["code_enc"]:
                        code=decode(current["code_enc"])
                        db.execute("UPDATE instagram_connection SET code_enc=NULL,status='connecting' WHERE id=1 AND version=%s",(version,))
                        return code
                    time.sleep(2)
                raise RuntimeError("VerificationCodeTimeout")
            if config["action"]=="login":
                client=Client();client.request_timeout=20;client.challenge_code_handler=get_code
                update("connecting")
                try:
                    if config["session_enc"]:
                        client.set_settings(json.loads(decode(config["session_enc"])))
                    password=decode(config["password_enc"])
                    try:
                        client.login(config["username"],password)
                    except TwoFactorRequired:
                        client.login(config["username"],password,verification_code=get_code())
                    encrypted=encode(json.dumps(client.get_settings()))
                    update("connected",session=encrypted);active_version=version
                except Exception as error:
                    update("error",type(error).__name__);client=None
                    report("login_stopped",error_type=type(error).__name__)
                time.sleep(2);continue
            if config["status"]!="connected":
                client=None;time.sleep(3);continue
            if client is None or active_version!=version:
                client=Client();client.request_timeout=20
                try:
                    client.set_settings(json.loads(decode(config["session_enc"])))
                    client.account_info();active_version=version
                except Exception as error:
                    update("error",type(error).__name__);client=None
                    time.sleep(3);continue
            job=db.execute("""UPDATE instagram_outbox SET state='sending',updated_at=now()
              WHERE id=(SELECT id FROM instagram_outbox WHERE state='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
              RETURNING id,recipient,message""").fetchone()
            if not job:
                time.sleep(3);continue
            stage="lookup"
            try:
                recipient_id=client.user_id_from_username(job["recipient"])
                stage="send"
                message=client.direct_send(job["message"],user_ids=[recipient_id])
                message_id=str(getattr(message,"id","") or "")
                if not message_id: raise RuntimeError("MissingMessageId")
            except Exception as error:
                db.execute("UPDATE instagram_outbox SET state=%s,error_code=%s,updated_at=now() WHERE id=%s",
                  ("unknown" if stage=="send" else "failed",type(error).__name__,job["id"]))
                update("error",type(error).__name__);client=None
                report("delivery_stopped",error_type=type(error).__name__)
                time.sleep(3);continue
            db.execute("UPDATE instagram_outbox SET state='sent',message_id=%s,error_code=NULL,updated_at=now() WHERE id=%s",(message_id,job["id"]))
            db.execute("UPDATE instagram_connection SET session_enc=%s WHERE id=1 AND version=%s",(encode(json.dumps(client.get_settings())),version))
            report("sent",job_id=str(job["id"]))
            time.sleep(3)

if __name__=="__main__":
    try: main()
    except Exception as error: report("worker_stopped",error_type=type(error).__name__)
