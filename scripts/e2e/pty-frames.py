# Runs a command in a PTY (PTY_COLS x PTY_ROWS), sends PTY_SCRIPT keys ([[seconds, "keys"], ...]) and
# prints the SCREEN at each time in PTY_SNAPSHOTS, using a minimal emulator (cursor positioning and
# printable cells: enough for OpenTUI's output). Exits with the command's exit code (124 on timeout).
#
#   PTY_SECONDS=10 PTY_SNAPSHOTS='[4]' PTY_SCRIPT='[[5,"q"]]' python3 scripts/e2e/pty-frames.py bun cli/index.js
import os, pty, sys, select, time, struct, fcntl, termios, json, re
script = json.loads(os.environ.get('PTY_SCRIPT', '[]'))
snaps = sorted(json.loads(os.environ.get('PTY_SNAPSHOTS', '[]')))
cols, rows = int(os.environ.get('PTY_COLS', 120)), int(os.environ.get('PTY_ROWS', 40))
grid = [[' '] * cols for _ in range(rows)]
cur = [0, 0]
TOKEN = re.compile(r'\x1b[\]P_^][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[([0-9;?<>=$]*)([ -/]*)([@-~])|\x1b[@-_]|[\s\S]')
def render(data):
    for r in grid: r[:] = [' '] * cols
    cur[0] = cur[1] = 0
    feed(data.decode('utf-8', 'ignore'))
    return '\n'.join(''.join(r).rstrip() for r in grid)
def feed(text):
    for m in TOKEN.finditer(text):
        tok = m.group(0)
        if m.group(3):
            params, final = m.group(1), m.group(3)
            nums = [int(p) if p.isdigit() else 0 for p in params.split(';')] if params and params[0].isdigit() else []
            if final in 'Hf':
                cur[0] = (nums[0] if nums else 1) - 1
                cur[1] = (nums[1] if len(nums) > 1 else 1) - 1
            elif final == 'C':
                cur[1] += nums[0] if nums else 1
            elif final == 'J' and (nums[:1] == [2]):
                for r in grid: r[:] = [' '] * cols
        elif tok.startswith('\x1b'):
            continue
        elif tok == '\r':
            cur[1] = 0
        elif tok == '\n':
            cur[0] += 1
        elif tok >= ' ':
            if 0 <= cur[0] < rows and 0 <= cur[1] < cols:
                grid[cur[0]][cur[1]] = tok
            cur[1] += 1
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
start, status, stream = time.time(), None, b''
while time.time() - start < float(os.environ.get('PTY_SECONDS', 10)):
    now = time.time() - start
    while script and script[0][0] <= now:
        os.write(fd, script.pop(0)[1].encode())
    while snaps and snaps[0] <= now:
        print(f"===== t={snaps.pop(0)}s =====")
        print(render(stream))
    r, _, _ = select.select([fd], [], [], 0.05)
    if r:
        try:
            stream += os.read(fd, 65536)
        except OSError:
            pass
    done, st = os.waitpid(pid, os.WNOHANG)
    if done:
        status = os.waitstatus_to_exitcode(st)
        break
sys.stderr.write(f"[pty] exit={status} elapsed={time.time()-start:.2f}s\n")
sys.exit(124 if status is None else status)
