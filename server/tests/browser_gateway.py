"""CI-only loopback bridge; executes the real staged RPCs as authenticated.
Synthetic bearer tokens map to fixed fixture claims. No hosted URL or secrets.
"""
import json
import os
import pathlib
import subprocess
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = pathlib.Path(__file__).resolve().parents[2]
ENV = dict(os.environ, PGHOST="127.0.0.1", PGPORT="5432", PGUSER="postgres",
           PGPASSWORD="office-test-only", PGDATABASE="office_test")
# Two independent sessions for owner A; separate owner B.
IDENTITIES = {"device-a": (1, 1), "device-b": (1, 4), "other-owner": (2, 2)}
def literal(value):
    # Encode all untrusted values as hex, never interpolate raw SQL text.
    return "pg_catalog.convert_from(pg_catalog.decode('" + value.encode("utf-8").hex() + "','hex'),'UTF8')"

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def reply(self, status, value):
        data = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/__office_test_rpc":
            self.reply(404, {"error": "not found"})
            return
        identity = IDENTITIES.get(self.headers.get("Authorization", "").removeprefix("Bearer "))
        if identity is None:
            self.reply(401, {"error": "unknown synthetic session"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 20_000_000:
                raise ValueError("request size")
            request = json.loads(self.rfile.read(length))
            name, args = request["name"], request["args"]
            owner = literal(args["p_expected_owner"]) + "::uuid"
            if name == "office_sync_manifest":
                call = f"public.office_sync_manifest({owner})"
            elif name == "office_sync_read":
                call = f"public.office_sync_read({owner},{literal(args['p_document_id'])})"
            elif name == "office_sync_push":
                call = f"public.office_sync_push({owner},{literal(json.dumps(args['p_operation']))}::jsonb)"
            else:
                raise ValueError("RPC not allowed")
            n, sid = identity
            claims = json.dumps({"sub": f"a0000000-0000-4000-8000-00000000000{n}",
                                 "session_id": f"b0000000-0000-4000-8000-00000000000{sid}",
                                 "client_id": "c0000000-0000-4000-8000-000000000001",
                                 "is_anonymous": False})
            query = "begin; set local role authenticated; set local request.jwt.claims = '" + claims + "'; select coalesce((" + call + ")::text,'null'); commit;"
            result = subprocess.run(["psql", "-XqAt", "-v", "ON_ERROR_STOP=1"], input=query,
                                    text=True, capture_output=True, env=ENV, timeout=25)
            if result.returncode:
                self.reply(403 if "office_access_denied" in result.stderr else 400, {"error": "isolated RPC rejected"})
                print("Isolated RPC rejected:", result.stderr.strip(), flush=True)
                return
            self.reply(200, json.loads(result.stdout.strip()))
        except (ValueError, TypeError, KeyError, subprocess.TimeoutExpired):
            self.reply(400, {"error": "invalid fixture request"})

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
