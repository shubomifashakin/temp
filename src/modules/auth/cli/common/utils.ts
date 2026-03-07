export function makeCliAuthCodeKey(code: string) {
  return `cli:auth:code:${code}`;
}
