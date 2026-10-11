// Copyright 2026- At Day. All rights reserved.
//
// Resolves the OrgDurableObject stub for an organization and binds it. The Worker never calls
// `idFromName` anywhere else, so the naming rule (organization id = object name) lives here.

import type { OrgDurableObject } from './OrgDurableObject';

export async function orgObject(
  env: Env,
  organizationId: string,
): Promise<DurableObjectStub<OrgDurableObject>> {
  const stub = env.ORG_DO.get(env.ORG_DO.idFromName(organizationId));
  await stub.bind(organizationId);
  return stub;
}
