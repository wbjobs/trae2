export interface IResult<T> {
  ok: true;
  data: T;
}

export interface IError {
  ok: false;
  code: string;
  message: string;
  cause?: unknown;
}

export type Result<T> = IResult<T> | IError;

export function ok<T>(data: T): IResult<T> {
  return { ok: true, data };
}

export function err(code: string, message: string, cause?: unknown): IError {
  return { ok: false, code, message, cause };
}

export function unwrap<T>(result: Result<T>, context = ''): T {
  if (result.ok) return result.data;
  const suffix = context ? ` [${context}]` : '';
  throw new Error(`${result.code}${suffix}: ${result.message}`);
}
