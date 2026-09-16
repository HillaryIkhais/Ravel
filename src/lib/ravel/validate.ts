import { Script } from 'node:vm';

export function isSyntaxValid(code: string): boolean {
  try {
    new Script(code);
    return true;
  } catch {
    return false;
  }
}