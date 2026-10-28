/** A user-correctable failure (bad request, unsupported dialect). Routes map it to its HTTP status. */
export class SqlCheckError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "SqlCheckError";
    this.code = code;
    this.status = status;
  }
}
