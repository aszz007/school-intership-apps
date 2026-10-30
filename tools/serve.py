"""Serve only course application files on loopback, without adding dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
from urllib.parse import unquote, urlsplit


class PreviewHandler(SimpleHTTPRequestHandler):
    # Windows registry can map .mjs to text/plain; modules require a JavaScript MIME type.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript'}

    def public_path(self):
        parts = unquote(urlsplit(self.path).path).replace('\\', '/').split('/')
        private_dirs = {'server', 'functions', 'scripts', 'test', 'node_modules', 'dist'}
        return not any((part.startswith('.') and part not in {'.', '..'}) or part in private_dirs or '.sqlite' in part for part in parts)

    def do_GET(self):
        if not self.public_path():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.public_path():
            self.send_error(404)
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent / "projects"
    with ThreadingHTTPServer((args.host, args.port), partial(PreviewHandler, directory=str(root))) as server:
        print(f"Preview: http://{args.host}:{args.port}/", flush=True)
        print("Serving course applications only; Ctrl+C stops the server.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
