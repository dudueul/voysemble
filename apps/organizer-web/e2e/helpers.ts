// Copyright 2026- At Day. All rights reserved.
// E2E helpers. Sign-in goes through the real magic-link flow: request, read the captured mail
// from the local-only /v1/dev/mailbox, open the link, land signed in. Unique addresses per run
// keep local D1 state from one run out of the next.

import { expect, type Page } from '@playwright/test';

export const OUT = '../../docs/captures/web';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

export async function signIn(page: Page, email = uniqueEmail('e2e')): Promise<string> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  const res = await page.request.get(`/v1/dev/mailbox?to=${encodeURIComponent(email)}`);
  expect(res.ok()).toBeTruthy();
  const mail = (await res.json()) as { text: string };
  const link = /https?:\/\/\S+#token=[A-Za-z0-9_-]+/.exec(mail.text)?.[0];
  if (!link) throw new Error('magic link not found in mail body');
  await page.goto(link);
  await page.waitForURL(/\/setup$/);
  return email;
}

/** Signs in and completes org + trip so fixture pages have a real shell context. */
export async function signInWithOrg(page: Page): Promise<void> {
  await signIn(page);
  await page.getByLabel('Organization name').fill('Seoul Arts High');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByTestId('step-2')).toHaveAttribute('data-state', 'open');
}
