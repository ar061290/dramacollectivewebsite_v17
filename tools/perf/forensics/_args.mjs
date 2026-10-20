// Shared by the forensics scripts: the repo's built site, and the two-build arguments.
import { fileURLToPath } from 'node:url';

/** The repo's dist/ (what `npm run build` writes), as an absolute path. */
export const DIST = fileURLToPath(new URL('../../../dist', import.meta.url));

/** `--flag value` pairs and the bare arguments, from process.argv. */
export function parse(argv = process.argv) {
  const flags = {};
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) flags[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else positional.push(a);
  }
  return { flags, positional };
}

/** For a script that compares two builds: --before <dist> (required) and --after <dist> (the repo's dist). */
export function twoBuilds(argv = process.argv) {
  const { flags, positional } = parse(argv);
  if (!flags.before) {
    console.error(`usage: node ${argv[1].replace(/\\/g, '/').replace(/.*\//, 'tools/perf/forensics/')} [page.html] --before <dist of the earlier build> [--after <dist>]`);
    process.exit(2);
  }
  return { before: String(flags.before), after: String(flags.after || DIST), positional, flags };
}
