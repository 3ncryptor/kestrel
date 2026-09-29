const HELP = `kestrel — system monitor and process manager for your terminal

Usage
  kestrel                     Dashboard: this machine, plus this project's stack (idle until you start it)
  kestrel sm                  System monitor (aliases: -sm, --sm)
  kestrel pm                  Start this project's stack and open the process manager (-pm, --pm)
  kestrel init                Create kestrel.json from a Procfile or package.json scripts
  kestrel import pm2 [file]   Convert a pm2 setup into kestrel.json
  kestrel doctor              Check this system, the terminal and the config
  kestrel update [--check]    Update a standalone install to the latest release

Options
  --config <path>     Use this kestrel.json instead of searching for one
  --only <a,b>        pm: start only these processes
  --interval <ms>     Refresh interval (250-60000, default 1000)
  --force             init/import: replace an existing kestrel.json
  -y, --yes           init: take the defaults; import: agree to read a .js ecosystem file
  --no-color          Plain output (NO_COLOR is also respected)
  -h, --help          Show this help
  -v, --version       Show the version

Developer
  kestrel sm --dump [--ticks N]   Print N JSON snapshots and exit (no UI)

Docs: docs/PRD.md · docs/BUILD_PLAN.md · docs/UI_SPEC.md
`;

/** @param {any} _parsed @param {{ stdout: { write: (s: string) => void } }} io */
function help(_parsed, io) {
    io.stdout.write(HELP);
    return 0;
}

module.exports = { help, HELP };
