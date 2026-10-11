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
