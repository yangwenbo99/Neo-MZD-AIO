# MZD-AIO CLI

Build USB installation packages from YAML, independently of Electron and saved
GUI state. Requires Node.js 22.2+ and this repository's scripts and payloads.

From the repository root:

```sh
npm ci --prefix cli
node cli/bin/mzd-aio.js list
node cli/bin/mzd-aio.js validate examples/tweaks.yaml
node cli/bin/mzd-aio.js plan examples/tweaks.yaml
node cli/bin/mzd-aio.js build examples/tweaks.yaml --output ./installation
```

Create or edit YAML in the local WebUI:

```sh
node cli/bin/mzd-aio.js configure
node cli/bin/mzd-aio.js configure examples/tweaks.yaml
```

The editor opens in your browser and prints its local URL. Use `--no-open` to open
the URL yourself, or `--port 9040` to choose a port. Stop it with Ctrl+C.
It supports all 40 tweaks, nested options, local asset browsing, image previews,
live YAML validation, and saving to a chosen config path. Changing the save path
rebases relative asset references. **Use example** starts a draft at that path.

See the [user guide](../docs/CLI.md), [complete catalogue and option reference](../docs/CLI-TWEAKS.md),
and [example configuration](../examples/tweaks.yaml).

Commands run offline after dependencies and selected assets are installed locally.
Builds stage their files and publish only after every copy, conversion, and archive
extraction finishes. The output directory must not already exist.

Run `npm test --prefix cli` for package-generation tests. They use Bash for syntax
checks and temporarily need slightly over 1 GiB of free space for swapfile tests.
`npm run test:webui --prefix cli` additionally runs a real-browser smoke test using
installed Chromium (`CHROMIUM` can specify its executable). Browser test files
and screenshots stay under this checkout's `tmp/`.
