import { Request, Response, NextFunction } from 'express';

export function globalErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('[Unhandled Error]', err);
  res.status(err.status ?? 500).json({
    error: isDev ? (err.message ?? 'Internal server error') : 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
}
