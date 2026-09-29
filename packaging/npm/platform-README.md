# {{name}}

**The `kestrel` binary for {{platform}}, installed for you by [kestrel-tui](https://www.npmjs.com/package/kestrel-tui).**

[![npm version](https://img.shields.io/npm/v/{{name}}.svg)](https://www.npmjs.com/package/{{name}})
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/3ncryptor/kestrel/blob/main/LICENSE)

> **You don't need to install this package yourself.** Install Kestrel with
>
> ```sh
> npm install -g kestrel-tui
> ```
>
> and npm adds this package automatically on {{platform}}.

## What Kestrel is

[Kestrel](https://github.com/3ncryptor/kestrel) is a system monitor and a process manager in one
terminal app, for macOS and Linux. It shows what is using your machine, the way htop and btop do, and
it starts and supervises your project's processes, the way pm2 or foreman do. The full documentation is
on the [kestrel-tui](https://www.npmjs.com/package/kestrel-tui) page.

## What this package contains

| File | |
|---|---|
| `bin/kestrel` | The standalone executable ({{size}}): the Bun runtime, Kestrel and its terminal UI compiled into one file |
| `README.md`, `LICENSE` | This file and the MIT licence |

It has no dependencies and no install scripts: nothing runs while npm installs it.

## How it gets installed

`kestrel-tui` lists one package per platform as an `optionalDependency`. Each declares its `os` and
`cpu`, so npm installs only the one that matches the machine and skips the rest:

{{packages}}

When you run `kestrel`, the launcher in `kestrel-tui` finds this binary and runs it with your terminal
attached, passing through the arguments, signals and exit code.

## Requirements

- {{requirements}}
- Node.js 18 or newer, only for the `kestrel-tui` launcher; the binary itself doesn't use Node.

## Versioning

This package is published together with `kestrel-tui` and always has exactly the same version, which
`kestrel-tui` pins. Mixing versions is not supported; update with `npm install -g kestrel-tui@latest`.

## Verifying it

Every release is built by GitHub Actions from a tagged commit of
[3ncryptor/kestrel](https://github.com/3ncryptor/kestrel) and published with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements), which this page links to.
Check an install with `npm audit signatures`.

## Without npm

The same binary is attached to every [GitHub release](https://github.com/3ncryptor/kestrel/releases/latest)
with a `SHA256SUMS` file and build attestations, and installs with a checksum-verifying script:

```sh
curl -fsSL https://raw.githubusercontent.com/3ncryptor/kestrel/main/packaging/install.sh | sh
```

## Links

- Kestrel on npm: https://www.npmjs.com/package/kestrel-tui
- Source and issues: https://github.com/3ncryptor/kestrel
- Changelog: https://github.com/3ncryptor/kestrel/blob/main/CHANGELOG.md
- Security policy: https://github.com/3ncryptor/kestrel/blob/main/SECURITY.md

## License

[MIT](https://github.com/3ncryptor/kestrel/blob/main/LICENSE) © Aryan Vibhuti
