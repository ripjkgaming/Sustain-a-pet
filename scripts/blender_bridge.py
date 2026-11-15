"""Send a command to the installed Blender MCP add-on's local socket."""
import argparse
import json
import socket
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('script', nargs='?')
parser.add_argument('--info', action='store_true')
args = parser.parse_args()
command = {'type': 'get_scene_info', 'params': {}} if args.info else {
    'type': 'execute_code', 'params': {'code': '__file__ = ' + repr(str(Path(args.script).resolve())) + '\n' + Path(args.script).read_text()}}
with socket.create_connection(('127.0.0.1', 9876), timeout=10) as connection:
    connection.settimeout(600)
    connection.sendall(json.dumps(command).encode())
    buffer = b''
    while True:
        chunk = connection.recv(65536)
        if not chunk:
            raise RuntimeError('Blender disconnected before replying')
        buffer += chunk
        try:
            result = json.loads(buffer)
            break
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    print(json.dumps(result, indent=2))
    if result.get('status') != 'success':
        raise SystemExit(1)
