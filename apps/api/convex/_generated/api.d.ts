/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as deletion from "../deletion.js";
import type * as events from "../events.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_vectorMatching from "../lib/vectorMatching.js";
import type * as matches from "../matches.js";
import type * as processing from "../processing.js";
import type * as system from "../system.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  deletion: typeof deletion;
  events: typeof events;
  "lib/errors": typeof lib_errors;
  "lib/events": typeof lib_events;
  "lib/validation": typeof lib_validation;
  "lib/vectorMatching": typeof lib_vectorMatching;
  matches: typeof matches;
  processing: typeof processing;
  system: typeof system;
  uploads: typeof uploads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
