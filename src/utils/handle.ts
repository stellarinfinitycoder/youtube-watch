const HANDLE_REGEX = /^@[A-Za-z0-9._-]{3,30}$/;

export function normalizeHandle(input: string): string {
  const trimmed = input.trim();

  if (!HANDLE_REGEX.test(trimmed)) {
    throw new Error(
      "Handle must be in @name format and contain 3-30 valid characters."
    );
  }

  return trimmed;
}

export function stripHandlePrefix(handle: string): string {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}
