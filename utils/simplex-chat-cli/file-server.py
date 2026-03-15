#!/usr/bin/env python3
"""
Minimal HTTP server to serve received files from the SimpleX CLI container.
Only allows paths under /tmp and /home/simplex for security.
Used when n8n runs in a separate container and cannot read files directly.
"""
import os
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

ALLOWED_PREFIXES = ("/tmp/", "/home/simplex/")
PORT = int(os.environ.get("FILE_SERVER_PORT", "8090"))


class FileHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/file":
            self.send_error(404, "Not Found")
            return
        params = urllib.parse.parse_qs(parsed.query)
        path = params.get("path", [None])[0]
        if not path:
            self.send_error(400, "Missing path parameter")
            return
        abs_path = os.path.abspath(path)
        if not any(abs_path.startswith(p) for p in ALLOWED_PREFIXES):
            self.send_error(403, "Path not allowed")
            return
        if not os.path.isfile(abs_path):
            self.send_error(404, "File not found")
            return
        try:
            with open(abs_path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(abs_path)}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except OSError as e:
            self.send_error(500, str(e))


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", PORT), FileHandler).serve_forever()
