import { Router } from 'express';

/** Creates the currently-unused user router without introducing import-time side effects. */
export function createUserRouter(): Router {
  return Router();
}
