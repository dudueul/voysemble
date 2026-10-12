// Copyright 2026- At Day. All rights reserved.
//
// Plain-text email bodies, KO and EN (D11). Generic wording: no PII beyond the recipient's
// address, no organization names in the magic-link mail.

import { localClock } from '../lib/time';
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

/**
 * The guardian digest (D29, slice 054): the digest-lane notifications of one trip for one
 * recipient, sent once at the organization's digest hour. Titles and short bodies only, each
 * with its wall-clock time in the trip's zone; no location, no care fact, no link with a token.
 */
export function digestEmail(
  to: string,
  locale: 'ko' | 'en',
  organizationName: string,
  tripName: string,
  timeZone: string,
  items: { title: string; body: string; createdAt: string }[],
): OutboundEmail {
  const lines = items.map((i) => {
    const { date, time } = localClock(i.createdAt, timeZone);
    return `- ${date} ${time} · ${i.title}${i.body ? `\n  ${i.body}` : ''}`;
  });
  const ko = {
    subject: `${tripName} 보호자 요약 (${items.length}건)`,
    text: `${organizationName}의 ${tripName}에서 오늘 보호자에게 공유된 알림입니다.\n\n${lines.join('\n')}\n\n자세한 내용은 Voysemble 앱의 받은 알림에서 확인하세요. 이 메일에는 답장할 수 없습니다.`,
  };
  const en = {
    subject: `${tripName}: your guardian digest (${items.length === 1 ? '1 update' : `${items.length} updates`})`,
    text: `What ${organizationName} shared with guardians on ${tripName} today.\n\n${lines.join('\n')}\n\nThe details are in the inbox of the Voysemble app. Replies to this email are not read.`,
  };
  const t = locale === 'ko' ? ko : en;
  return { to, subject: t.subject, text: t.text, locale, tag: 'digest' };
}

/**
 * Slice 076: a card opened from a phone reaches the owners and organizers at once, since they
 * have no app: a traveler's "I need help" (kind `help`) or a leader's card (kind `manual`). The
 * traveler's own words are the body's first line; the clock is the trip's; the link opens the
 * Safety page. Slice 078: the card a head count opens when it closes with people missing (kind
 * `headcount_missing`), the most urgent of the three.
 */
export function incidentOpenedEmail(
  to: string,
  locale: 'ko' | 'en',
  organizationName: string,
  trip: { name: string; timeZone: string },
  incident: {
    kind: string;
    title: string;
    names: string[];
    openedByName: string;
    openedAt: string;
  },
  url: string,
): OutboundEmail {
  const { date, time } = localClock(incident.openedAt, trip.timeZone);
  const names = incident.names.join(', ');
  const count = incident.names.length;
  const help = incident.kind === 'help';
  const missing = incident.kind === 'headcount_missing';
  const ko = {
    subject: missing
      ? `${trip.name}: 인원 점검 마감, ${count}명 미확인 · ${names}`
      : help
        ? `${trip.name}: ${names} 님이 도움을 요청했습니다`
        : `${trip.name}: ${incident.openedByName} 인솔자가 사건을 열었습니다 · ${names}`,
    text: `${organizationName}의 ${trip.name}에서 ${date} ${time}에 ${missing ? `${incident.openedByName} 인솔자가 인원 점검을 마감했고 ${count}명이 미확인입니다` : help ? `${names} 님이 휴대폰에서 도움을 요청했습니다` : `${incident.openedByName} 인솔자가 휴대폰에서 사건을 열었습니다`}.\n\n${incident.title}\n관련 여행자: ${names}\n\n인솔자와 보호자에게는 이미 알렸습니다. 안전 페이지에서 확인하고 해결하세요:\n${url}\n\n이 메일에는 답장할 수 없습니다.`,
  };
  const en = {
    subject: missing
      ? `${trip.name}: head count closed with ${count} missing · ${names}`
      : help
        ? `${trip.name}: ${names} asked for help`
        : `${trip.name}: incident opened by ${incident.openedByName} · ${names}`,
    text: `On ${trip.name} (${organizationName}), at ${date} ${time}, ${missing ? `leader ${incident.openedByName} closed the head count with ${count} missing` : help ? `${names} asked for help from the phone` : `leader ${incident.openedByName} opened an incident from the phone`}.\n\n${incident.title}\nTravelers: ${names}\n\nThe leaders and the guardians already heard it. Open the Safety page to follow and resolve it:\n${url}\n\nReplies to this email are not read.`,
  };
  const t = locale === 'ko' ? ko : en;
  return { to, subject: t.subject, text: t.text, locale, tag: 'incident' };
}
