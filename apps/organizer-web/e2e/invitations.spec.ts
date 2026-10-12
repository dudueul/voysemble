// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 042 (D33): the owner invites an organizer from Settings; the invitee
// opens the emailed link signed out, signs in with that address through the magic link, lands
// back on the invitation and joins; the console opens on the organization; the owner's members
// card lists the organizer and the invitation reads Accepted; a second invitation is revoked.
// Captures invitation-accepted.png (the invitee) and settings-invitations.png (the owner).

import { expect, type Page, test } from '@playwright/test';
import { OUT, signInWithOrg, uniqueEmail } from './helpers';

async function latestMail(page: Page, to: string): Promise<{ text: string; tag: string }> {
  const res = await page.request.get(`/v1/dev/mailbox?to=${encodeURIComponent(to)}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { text: string; tag: string };
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('invitations: the owner invites, the invitee signs in and joins, a second one is revoked', async ({
  page,
  browser,
}, info) => {
  await signInWithOrg(page);
  await page.goto('/settings');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('No invitations yet.')).toBeVisible();

  // The owner invites.
  const organizer = uniqueEmail('organizer');
  const form = page.getByRole('form', { name: 'Invite an organizer' });
  await form.getByLabel('Email').fill(organizer);
  await form.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByTestId('settings-invite-status')).toHaveText(
    `Invitation sent to ${organizer}.`,
  );
  const pending = page.getByTestId('invitation-pending');
  await expect(pending).toContainText(organizer);
  await expect(pending).toContainText('Pending');

  // The mail carries the link (the organization's language is Korean, the body names it).
  const invite = await latestMail(page, organizer);
  expect(invite.tag).toBe('invite');
  expect(invite.text).toContain('Seoul Arts High');
  const link = /https?:\/\/\S+\/invitations\/accept#token=[A-Za-z0-9_-]+/.exec(invite.text)?.[0];
  if (!link) throw new Error('invitation link not found in the mail body');

  // The invitee opens it signed out: the sign-in form with the lead; the token waits.
  const ctx = await browser.newContext();
  const invitee = await ctx.newPage();
  await invitee.emulateMedia({ reducedMotion: 'reduce' });
  await invitee.goto(link);
  await expect(invitee.getByTestId('signin-lead')).toContainText('Sign in with the address');
  await expect(invitee).toHaveURL(/\/invitations\/accept$/);
  await invitee.getByLabel('Email').fill(organizer);
  await invitee.getByRole('button', { name: 'Email me a link' }).click();
  await expect(invitee.getByRole('status')).toContainText('Check your email');
  const magic = await latestMail(invitee, organizer);
  expect(magic.tag).toBe('magic-link');
  const magicLink = /https?:\/\/\S+#token=[A-Za-z0-9_-]+/.exec(magic.text)?.[0];
  if (!magicLink) throw new Error('magic link not found in the mail body');
  await invitee.goto(magicLink);
  // The verify page comes back to the invitation; the account joins.
  await invitee.waitForURL(/\/invitations\/accept$/);
  await expect(invitee.getByTestId('invitation-result')).toHaveText(
    'You now organize Seoul Arts High',
  );
  await invitee.mouse.move(0, 0);
  await invitee.screenshot({
    path: `${OUT}/${info.project.name}/invitation-accepted.png`,
    fullPage: true,
  });
  await invitee.getByRole('link', { name: 'Open the console' }).click();
  await invitee.waitForURL(/\/$/);
  await expect(invitee.getByText('Seoul Arts High').first()).toBeVisible();
  // An organizer's Settings: the values, Save disabled, the invitation list, no form.
  await invitee.goto('/settings');
  await expect(invitee.getByText('Live', { exact: true })).toBeVisible();
  await expect(invitee.getByTestId('settings-profile-status')).toContainText('Only the owner');
  await expect(invitee.getByTestId('invitation-accepted')).toContainText(organizer);
  await expect(invitee.getByRole('form', { name: 'Invite an organizer' })).toHaveCount(0);
  await ctx.close();

  // The owner sees the organizer in the members card and the invitation accepted.
  await page.reload();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByTestId('member-organizer')).toContainText(organizer);
  await expect(page.getByTestId('member-organizer')).toContainText('Organizer');
  await expect(page.getByTestId('invitation-accepted')).toContainText('Accepted');

  // A second invitation, revoked before anyone opens it.
  const second = uniqueEmail('organizer2');
  await form.getByLabel('Email').fill(second);
  await form.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByTestId('settings-invite-status')).toHaveText(
    `Invitation sent to ${second}.`,
  );
  await page.getByRole('button', { name: `Revoke the invitation of ${second}` }).click();
  await expect(page.getByTestId('invitation-revoked')).toContainText(second);
  await expect(page.getByTestId('invitation-revoked')).toContainText('Revoked');
  await expect(page.getByRole('button', { name: /^Revoke the invitation/ })).toHaveCount(0);

  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/settings-invitations.png`,
    fullPage: true,
  });

  // The revoked link is dead for its invitee.
  const revokedMail = await latestMail(page, second);
  const deadLink = /https?:\/\/\S+\/invitations\/accept#token=[A-Za-z0-9_-]+/.exec(
    revokedMail.text,
  )?.[0];
  if (!deadLink) throw new Error('second invitation link not found');
  const ctx2 = await browser.newContext();
  const late = await ctx2.newPage();
  await late.goto(deadLink);
  await late.getByLabel('Email').fill(second);
  await late.getByRole('button', { name: 'Email me a link' }).click();
  await expect(late.getByRole('status')).toContainText('Check your email');
  const magic2 = await latestMail(late, second);
  const magicLink2 = /https?:\/\/\S+#token=[A-Za-z0-9_-]+/.exec(magic2.text)?.[0];
  if (!magicLink2) throw new Error('magic link not found');
  await late.goto(magicLink2);
  await late.waitForURL(/\/invitations\/accept$/);
  await expect(late.getByRole('alert')).toContainText('revoked, expired after 7 days');
  await ctx2.close();
});
