// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 033 (D22): a guardian who joined from "the phone" writes to the
// organizer; the console lists the guardian channel with an unread badge, opens the thread,
// replies; the guardian's channel then shows the reply as unread; a traveler is kept out of the
// guardian's channel.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signIn, signInWithOrg } from './helpers';

async function call(page: Page, method: 'GET' | 'POST', url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const r = await fetch(url, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
      return { ok: r.ok, status: r.status, text: await r.text() };
    },
    { method, url, body },
  );
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('chat: a guardian writes, the organizer answers from Communication', async ({
  page,
  browser,
}, info) => {
  await signInWithOrg(page);
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page
    .getByLabel('Or paste CSV')
    .fill('name,group,guardian_name,guardian_contact\nMinji Park,Bus A,Sora Park,sora@example.com');
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('1');
  await page.getByRole('button', { name: 'Issue invite codes' }).click();
  const codeOf = async (name: string) =>
    (await page
      .getByTestId('invite-table')
      .locator('tbody tr', { hasText: name })
      .first()
      .locator('code')
      .textContent()) ?? '';
  const soraCode = await codeOf('Sora Park');
  const minjiCode = await codeOf('Minji Park');

  // Sora (guardian) and Minji (traveler) join from "the phone".
  const ctx = await browser.newContext();
  const sora = await ctx.newPage();
  await signIn(sora);
  const redeem = await call(sora, 'POST', '/v1/invites/redeem', { code: soraCode });
  expect(redeem.ok, `redeem: ${redeem.status} ${redeem.text}`).toBeTruthy();
  const { organizationId, tripId, participation } = JSON.parse(redeem.text) as {
    organizationId: string;
    tripId: string;
    participation: { id: string };
  };
  const base = `/v1/orgs/${organizationId}/trips/${tripId}`;
  const channelId = `guardian:${participation.id}`;
  const list = await call(sora, 'GET', `${base}/chats`);
  expect(
    (JSON.parse(list.text) as { channels: { id: string }[] }).channels.map((c) => c.id),
  ).toEqual([channelId]);
  const sent = await call(sora, 'POST', `${base}/chats/${encodeURIComponent(channelId)}/messages`, {
    body: 'Will the bus be late tomorrow?',
  });
  expect(sent.status, sent.text).toBe(201);
  const ctx2 = await browser.newContext();
  const minji = await ctx2.newPage();
  await signIn(minji);
  expect((await call(minji, 'POST', '/v1/invites/redeem', { code: minjiCode })).ok).toBeTruthy();
  expect(
    (await call(minji, 'GET', `${base}/chats/${encodeURIComponent(channelId)}/messages`)).status,
  ).toBe(403);
  await ctx2.close();

  // The organizer sees the unread guardian channel, opens it, replies.
  await page.goto('/communication');
  await expect(page.getByTestId(`unread-${channelId}`)).toHaveText('1');
  await page.getByRole('button', { name: 'Open Sora Park' }).click();
  await expect(page.getByTestId('chat-messages')).toContainText('Will the bus be late tomorrow?');
  const thread = page.getByTestId('chat-thread');
  await thread.getByLabel('Message', { exact: true }).fill('No, 07:15 at the lobby as planned.');
  await thread.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('chat-messages')).toContainText(
    'No, 07:15 at the lobby as planned.',
  );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/communication-chat.png`,
    fullPage: true,
  });

  // Slice 065 (D22): the organizer removes Sora's message; the tombstone stays for both sides.
  await thread.getByRole('button', { name: 'Remove message from Sora Park' }).click();
  await expect(page.getByTestId('chat-messages')).toContainText('Message removed by Owner');
  await expect(page.getByTestId('chat-messages')).not.toContainText(
    'Will the bus be late tomorrow?',
  );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/communication-chat-removed.png`,
    fullPage: true,
  });

  // Sora's channel shows the reply as unread; opening it marks it read.
  const after = JSON.parse((await call(sora, 'GET', `${base}/chats`)).text) as {
    channels: { unread: number; lastMessage: { body: string; mine: boolean } }[];
  };
  expect(after.channels[0]).toMatchObject({
    unread: 1,
    lastMessage: { body: 'No, 07:15 at the lobby as planned.', mine: false },
  });
  await call(sora, 'GET', `${base}/chats/${encodeURIComponent(channelId)}/messages`);
  expect(
    (
      JSON.parse((await call(sora, 'GET', `${base}/chats`)).text) as {
        channels: { unread: number }[];
      }
    ).channels[0]?.unread,
  ).toBe(0);
  // Slice 065: Sora's phone reads the tombstone in place of her message.
  const soraThread = JSON.parse(
    (await call(sora, 'GET', `${base}/chats/${encodeURIComponent(channelId)}/messages`)).text,
  ) as { messages: { body: string; removed?: { byName: string } }[] };
  expect(soraThread.messages[0]).toMatchObject({ body: '', removed: { byName: 'Owner' } });
  await ctx.close();
  await page.getByRole('button', { name: /All channels/ }).click();
  await expect(page.getByTestId(`unread-${channelId}`)).toHaveCount(0);
});
