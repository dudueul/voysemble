// Copyright 2026- At Day. All rights reserved.
//
// @voysemble/contracts: external API contracts.
//
// Owns: Zod schemas for every request/response/error envelope exposed by the Workers.
// Must not: import runtime code, persistence, or provider SDKs. Pure schemas only.
// Invariant: anything a client can send or receive is described here first, then generated.

export { z } from '@hono/zod-openapi';
export * from './announcement';
export * from './auth';
export * from './care';
export * from './chat';
export * from './common';
export * from './documents';
export * from './error';
export * from './fees';
export * from './guardian';
export * from './headcount';
export * from './health';
export * from './incident';
export * from './itinerary';
export * from './media';
export * from './organization';
export * from './person';
export * from './report';
export * from './roster';
export * from './trip';
export * from './window';
