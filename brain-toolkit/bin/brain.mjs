#!/usr/bin/env node
// `brain` — the single command of the Open Project Brain Standard toolkit.
//
// Two lifecycles, one command:
//   brain setup / uninstall        machine-level toolchain management (this
//                                  npm package fans the skill bundles out to
//                                  each agent runtime's global skills dir)
//   brain init / wire / list-pages… project-level knowledge CLI — implemented
//                                  in the brain-page skill bundle (so a copied
//                                  or symlinked bundle stays self-contained);
//                                  this entry point just delegates to it.
//
// `npx @mindmux/brain-md setup` also lands here: with a single bin in the package,
// npx runs it regardless of the bin's name.

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <pkg>/bin
const sub = process.argv[2];

const TOOLCHAIN_BLURB = `Toolchain (machine-level, run once; never touches project brain data):
  brain setup [--project] [--symlink] [--yes]     install the skills into agent runtimes
  brain uninstall [--project] [--keep-state] [--yes]
`;

const INSTALL_HELP = `brain — the Open Project Brain Standard toolkit

${TOOLCHAIN_BLURB}
Everything else (init, wire, pages, …) is the project-level brain CLI —
run \`brain help\`.`;

function parseInstallOpts(argv) {
  const opts = { assumeYes: false, symlink: false, project: false, keepState: false };
  for (const a of argv) {
    switch (a) {
      case "--yes":
      case "-y":
        opts.assumeYes = true;
        break;
      case "--symlink":
        opts.symlink = true;
        break;
      case "--project":
        opts.project = true;
        break;
      case "--keep-state":
        opts.keepState = true;
        break;
      case "-h":
      case "--help":
        console.log(INSTALL_HELP);
        process.exit(0);
        break;
      default:
        console.error(`brain: unknown option '${a}'`);
        process.exit(2);
    }
  }
  return opts;
}

if (sub === "setup" || sub === "uninstall") {
  const { runSetup, runUninstall } = await import("./lib/installer.mjs");
  const opts = parseInstallOpts(process.argv.slice(3));
  const run = sub === "setup" ? runSetup : runUninstall;
  run(opts).catch((e) => {
    console.error(`brain ${sub}: ${e?.message || e}`);
    process.exit(1);
  });
} else {
  // Surface toolchain commands when users land on top-level help after
  // `npm i -g @mindmux/brain-md` (the skill-bundle CLI only knows project commands).
  if (sub === undefined || sub === "help" || sub === "-h" || sub === "--help") {
    process.stdout.write(`${TOOLCHAIN_BLURB}\n`);
  }
  const cli = join(here, "..", "skills", "brain-page", "bin", "brain.mjs");
  // Importing runs the CLI's main() against the current process.argv / cwd.
  // Use a file:// URL so the absolute path also resolves on Windows ESM.
  await import(pathToFileURL(cli).href);
}
