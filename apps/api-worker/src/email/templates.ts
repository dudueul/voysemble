// Copyright 2026- At Day. All rights reserved.
//
// Plain-text email bodies, KO and EN (D11). Generic wording: no PII beyond the recipient's
// address, no organization names in the magic-link mail.

import type { OutboundEmail } from './EmailPort';

export function magicLinkEmail(to: string, locale: 'ko' | 'en', url: string): OutboundEmail {
  const ko = {
    subject: 'Voysemble 로그인 링크',
    text: `아래 링크를 15분 안에 열어 로그인하세요.\n\n${url}\n\n요청하지 않았다면 이 메일을 무시하세요.`,
  };
  const en = {
    subject: 'Your Voysemble sign-in link',
    text: `Open this link within 15 minutes to sign in.\n\n${url}\n\nIf you did not request it, ignore this email.`,
  };
  const t = locale === 'ko' ? ko : en;
  return { to, subject: t.subject, text: t.text, locale, tag: 'magic-link' };
}

/**
 * Organizer invitation (slice 042, D33). Names the organization (not PII) and the address the
 * invitee must sign in with; the link works once, for seven days. The sender stays unnamed.
 */
export function organizerInvitationEmail(
  to: string,
  locale: 'ko' | 'en',
  organizationName: string,
  url: string,
): OutboundEmail {
  const ko = {
    subject: `${organizationName} 운영자 초대`,
    text: `${organizationName}의 소유자가 당신을 Voysemble 운영자로 초대했습니다.\n\n아래 링크를 열고 이 주소(${to})로 로그인하면 바로 참여됩니다. 링크는 7일 동안 한 번 쓸 수 있습니다.\n\n${url}\n\n모르는 초대라면 이 메일을 무시하세요.`,
  };
  const en = {
    subject: `Invitation to organize ${organizationName} on Voysemble`,
    text: `The owner of ${organizationName} invited you to organize it on Voysemble.\n\nOpen this link and sign in with this address (${to}) to join. The link works once, for 7 days.\n\n${url}\n\nIf you do not know this invitation, ignore this email.`,
  };
  const t = locale === 'ko' ? ko : en;
  return { to, subject: t.subject, text: t.text, locale, tag: 'invite' };
}

/** Step-up confirmation (D35, slice 045): the signed-in account proves it still holds the mailbox. */
export function reauthEmail(to: string, locale: 'ko' | 'en', url: string): OutboundEmail {
  const ko = {
    subject: 'Voysemble 본인 확인 링크',
    text: `콘솔에서 보호된 작업을 열려고 합니다. 아래 링크를 15분 안에 열어 본인임을 확인하세요.\n\n${url}\n\n요청하지 않았다면 이 메일을 무시하세요. 아무것도 열리지 않습니다.`,
  };
  const en = {
    subject: 'Confirm it is you on Voysemble',
    text: `A protected action on the console needs a fresh confirmation. Open this link within 15 minutes.\n\n${url}\n\nIf you did not ask for it, ignore this email; nothing opens without it.`,
  };
  const t = locale === 'ko' ? ko : en;
  return { to, subject: t.subject, text: t.text, locale, tag: 'magic-link' };
}
