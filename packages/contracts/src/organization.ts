// Copyright 2026- At Day. All rights reserved.
//
// Organization contracts. An organization is the data boundary (ADR-0001) and the unit of
// encryption keys (ADR-0005). Created by any signed-in account, who becomes its owner (D26).

import { z } from '@hono/zod-openapi';
import { Id, Locale, OrgRole, Timestamp } from './common';

export const OrganizationName = z.string().trim().min(1).max(120);

export const CreateOrganizationRequest = z
  .object({
    name: OrganizationName,
    defaultLocale: Locale.default('ko'),
  })
  .openapi('CreateOrganizationRequest');
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequest>;

export const Organization = z
  .object({
    id: Id,
    name: OrganizationName,
    defaultLocale: Locale,
    createdAt: Timestamp,
    /** The caller's role in this organization. */
    role: OrgRole,
  })
  .openapi('Organization');
export type Organization = z.infer<typeof Organization>;

export const OrganizationList = z
  .object({ organizations: z.array(Organization) })
  .openapi('OrganizationList');
export type OrganizationList = z.infer<typeof OrganizationList>;
