// @camp404/os/terminal: the command engine and its window. The commands
// themselves are each app's own.

export {
  EMPTY_HISTORY,
  PROMPT,
  err,
  hi,
  out,
  parseLine,
  recall,
  remember,
  runCommand,
  type Command,
  type CommandTable,
  type ParsedLine,
  type TermHistory,
  type TermLine,
  type TermResult,
} from "./engine";
export { TerminalWindow } from "./terminal-window";
