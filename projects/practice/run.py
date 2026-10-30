import uvicorn
import argparse
import json
import threading
import time
import urllib.request
import webbrowser
from server.app import create_app


def open_when_ready():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4250/api/health', timeout=1) as response:
                if json.load(response).get('product') == 'zhilian':
                    webbrowser.open('http://127.0.0.1:4250/')
                    return
        except OSError:
            pass
        time.sleep(0.2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='启动本机知练服务')
    parser.add_argument('--open-browser', action='store_true')
    args = parser.parse_args()
    app = create_app()
    if args.open_browser:
        threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run(app, host='127.0.0.1', port=4250, log_level='info')
