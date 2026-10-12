// Copyright 2026- At Day. All rights reserved.
//
// The words on a chat channel card (D22; slice 064). The server composes titles and subtitles
// so both phones and the console show the same thing; since this slice they follow the reader's
// account language instead of being English for everyone. Names and group labels are the
// roster's and stay as typed.

export type ChatLocale = 'ko' | 'en';

export type ChatWords = {
  /** The whole-trip channel. */
  tripTitle: string;
  tripSubtitle: (travelers: number, leaders: number) => string;
  /** A group channel is titled by the group; the subtitle counts who is in it. */
  groupSubtitle: (travelers: number, leaders: number) => string;
  /** A traveler's own channel with their leaders. */
  yourLeaders: string;
  withLeaders: (names: string) => string;
  /** The same channel seen by a leader. */
  travelerSubtitle: (name: string, group: string | null) => string;
  /** A guardian's channel with the organizer, seen by the guardian. */
  theOrganizer: string;
  withOrganizer: string;
  /** The same channel seen by the organizer. */
  guardianOf: (travelerName: string | null) => string;
};

export function chatWords(locale: ChatLocale): ChatWords {
  if (locale === 'ko') {
    return {
      tripTitle: '여행 전체',
      tripSubtitle: (t, l) => `여행자 ${t}명 · 인솔자 ${l}명 · 주최자`,
      groupSubtitle: (t, l) => `여행자 ${t}명 · 인솔자 ${l}명`,
      yourLeaders: '내 인솔자',
      withLeaders: (names) => (names ? `인솔자 ${names}` : '내 인솔자와의 대화'),
      travelerSubtitle: (name, group) => `${name} · ${group ?? '조 없음'}`,
      theOrganizer: '주최자',
      withOrganizer: '여행 주최자와의 대화',
      guardianOf: (name) => `${name ?? '여행자'}의 보호자`,
    };
  }
  return {
    tripTitle: 'Everyone on the trip',
    tripSubtitle: (t, l) => `${t} travelers · ${l} leaders · the organizer`,
    groupSubtitle: (t, l) => `${t} travelers · ${l} ${l === 1 ? 'leader' : 'leaders'}`,
    yourLeaders: 'Your leaders',
    withLeaders: (names) => `with ${names || 'your leaders'}`,
    travelerSubtitle: (name, group) => `with ${name} · ${group ?? 'no group'}`,
    theOrganizer: 'The organizer',
    withOrganizer: 'with the trip organizer',
    guardianOf: (name) => `guardian of ${name ?? 'a traveler'}`,
  };
}
