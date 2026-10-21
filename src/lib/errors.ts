// Ported verbatim from legacy/src/lib/errorHandler.ts:7-33 — no logger inside
// plain error classes (v1's copies carried a debug import; dropped in v2).
export class AuthenticationError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class HostNotFoundError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'HostNotFoundError'
  }
}

export class BadRequestError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'BadRequestError'
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'ResourceNotFoundError'
  }
}
