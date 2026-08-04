/** A database uniqueness/check/foreign-key conflict safe to expose as a 409. */
export class D1ConflictError extends Error {
  constructor(message = 'Database conflict', constraint = 'constraint') {
    super(message);
    this.name = 'D1ConflictError';
    this.code = 'D1_CONFLICT';
    this.status = 409;
    this.statusCode = 409;
    this.constraint = constraint;
  }
}

/** A transient/unavailable D1 error safe to expose as a 503. */
export class D1UnavailableError extends Error {
  constructor(message = 'Database unavailable') {
    super(message);
    this.name = 'D1UnavailableError';
    this.code = 'D1_UNAVAILABLE';
    this.status = 503;
    this.statusCode = 503;
  }
}
