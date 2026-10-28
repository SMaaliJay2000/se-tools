/** A user-correctable failure (bad input, unsupported algorithm, failed authentication). Routes map it to its HTTP status. */
export class PlaygroundError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PlaygroundError";
    this.code = code;
    this.status = status;
  }
}
