/**
 * FlowVid API - Error Handling Middleware
 * Global error handler and async wrapper
 */

import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";
import { isApiError, createErrorResponse } from "../utils/errors.js";
import config from "../config/index.js";

/**
 * Global error handling middleware
 * Must be the last middleware in the chain
 */
export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log error in development
  if (config.server.isDevelopment) {
    console.error("Error:", error);
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationErrors = error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));

    res.status(422).json({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: validationErrors,
    });
    return;
  }

  // Handle our custom API errors
  if (isApiError(error)) {
    res.status(error.statusCode).json(createErrorResponse(error));
    return;
  }

  // Handle unknown errors
  const statusCode = 500;
  const message = config.server.isProduction
    ? "Internal server error"
    : error.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    code: "INTERNAL_ERROR",
    ...(config.server.isDevelopment && { stack: error.stack }),
  });
}

/**
 * 404 Not Found handler for undefined routes
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: "NOT_FOUND",
  });
}

/**
 * Async handler wrapper - catches async errors and passes to error middleware
 * Use this to wrap async route handlers
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate request body with a Zod schema
 */
export function validateBody<T>(schema: { parse: (data: unknown) => T }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate request query with a Zod schema
 */
export function validateQuery<T>(schema: { parse: (data: unknown) => T }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate request params with a Zod schema
 */
export function validateParams<T>(schema: { parse: (data: unknown) => T }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateBody,
  validateQuery,
  validateParams,
};
