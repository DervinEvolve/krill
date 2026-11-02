/** The krill banner for `krill` and `krill --help`, and the one-glyph mark on result lines. */

const TAGLINE = "tiny voters, collectively heavier than any whale";

/** Facing left: antennae and rostrum, the carapace with its eye and legs, a curved abdomen of plates with swimmerets, and the tail fan. */
const BANNER = [
  "                     _.-~~~~~~~~~~~~~~~~-._",
  "  ~~~-.          _.-'           |     |    /-._",
  "       `-._  <==/               |     |   /    /-.",
  "           `--- |   @          __..--------.  /   /.",
  "           _.-' \\    __..--~~''  ' ' ' '    `-._ /  /",
  "      _.-'       `-._ / / / /              ' '  `. / \\",
  "  ~~-'               / / / /                   '  \\ / |",
  "                                                   \\__/",
  "                                                 _/ | \\_",
  "                                                /__/|\\__\\",
];

export const banner = (): string => [...BANNER, "", `  ${TAGLINE}`].join("\n");

/**
 * Plain output: no glyphs or colour when `NO_COLOR` or `KRILL_PLAIN=1` is set,
 * or when stdout is a pipe or a file.
 */
export const isPlain = (env: NodeJS.ProcessEnv, tty: boolean): boolean => !tty || Boolean(env.NO_COLOR) || env.KRILL_PLAIN === "1";

/** Prefix of a command's result line. */
export const mark = (plain: boolean): string => (plain ? "~<" : "🦐");
