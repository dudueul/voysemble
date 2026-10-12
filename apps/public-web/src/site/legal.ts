// Copyright 2026- At Day. All rights reserved.
//
// Draft privacy policy and terms, both languages, written from the decisions that define how the
// product handles personal data: D13 (guardian visibility), D15 (meeting windows), D18 (photos),
// D20 (retention and crypto-shred), D21 (accounts), D23 (payments), D27 (care notes, documents),
// D28 (devices), ADR-0001 and ADR-0005 (encryption tiers and keys), ADR-0006 (AI boundary).
// Every page renders the locale's `legal.draftNotice` on top until the founder's review replaces
// the wording; the structure and URLs (/privacy/, /terms/, /ko/privacy/, /ko/terms/) are the ones
// the app store listings will point at.

import type { Locale } from './model.ts';

export type LegalKind = 'privacy' | 'terms';

export interface LegalSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDoc {
  kind: LegalKind;
  title: string;
  intro: string;
  sections: LegalSection[];
}

const privacyEn: LegalDoc = {
  kind: 'privacy',
  title: 'Privacy policy',
  intro:
    'Voysemble is operated by At Day for organizations that run group travel. This policy explains what the service stores, who can see it, how long it is kept, and what you can ask us to do. Organizers enter data on behalf of their organization; travelers, leaders and guardians use the apps under that organization’s trip.',
  sections: [
    {
      title: 'What the service stores',
      paragraphs: [
        'Only what running a trip needs, entered by the organizer, a leader, a traveler or a guardian:',
      ],
      bullets: [
        'Account: an email address used for sign-in, or an Apple or Google identity; session and device records needed to keep you signed in and to revoke a lost device.',
        'Roster: display names, group names, the trip role, and the binding between a guardian and one traveler. A guardian contact entered for an invite is used to send that invite and is not kept.',
        'Trip operation: itineraries and their revisions, announcements and acknowledgments, head counts, change proposals, incident cards and their confirmations, chat messages in the trip’s fixed channels.',
        'Care notes: an allergy, medication or short note a guardian enters for a traveler.',
        'Documents: passport or consent scans an organizer uploads, if any.',
        'Photos uploaded to the trip pool, with location metadata removed on upload.',
        'Meeting windows: inside, outside, uncertain or stale states while a window the traveler joined is open. Coordinates are processed in memory for the window and are not written to storage.',
        'Fees: the organizer’s ledger of paid, unpaid and refunded amounts per roster row. No card numbers; organizer license payments are handled by Stripe on Stripe’s pages.',
        'Audit entries: who revealed a care note or document, opened a channel during an incident, revoked a device, or confirmed an incident, and when.',
      ],
    },
    {
      title: 'Who can see what',
      paragraphs: [
        'Access follows the role the organizer assigned through the invite code; nobody chooses their own role.',
      ],
      bullets: [
        'Organizers (and the organization’s owner) see everything in their organization except care notes, which are shown to the leaders of the traveler’s group, and documents, which require a fresh sign-in to reveal.',
        'Leaders see their trip’s roster, itinerary, head counts, acknowledgments, proposals and incidents, and the care notes of travelers in their group behind an audited reveal.',
        'Travelers see the published itinerary, announcements, their own acknowledgments, meeting windows they were invited to, the trip photo pool and their own fee balance if the organizer shares it.',
        'Guardians see the published itinerary, announcements marked for guardians, the head count result for their own traveler, incident status messages about their traveler, the approved photo album and their own balance. Guardians never see coordinates, room numbers or sync timestamps.',
        'Drivers, hotels and venues receive time-limited sealed links with counts, times and places, never names.',
        'At Day staff diagnose platform problems through audited administrative tools and do not read trip content.',
      ],
    },
    {
      title: 'How it is protected',
      paragraphs: [
        'The service runs on Cloudflare’s network. Each organization’s data is stored in its own isolated store. Personal fields are encrypted with a per-organization key that is itself wrapped by a key held only in the service’s secret store; documents and photo originals are stored encrypted; keys are versioned and rotated without rewriting everything.',
        'Sign-in uses one-time links, Apple or Google identity, and invite codes whose plaintext is shown once and stored only as a hash. Sessions are opaque tokens that can be revoked per device.',
      ],
    },
    {
      title: 'Automated processing',
      paragraphs: [
        'On phones, any machine learning runs on the device. On the organizer side, the service uses Workers AI on At Day’s own Cloudflare account to translate announcements between Korean and English, to flag photos for review (nudity, close-ups of minors not on the roster), to suggest itinerary entries from documents an organizer provides, and to draft replans the organizer can edit. No third-party AI provider receives trip content. Nothing produced by these tools reaches a traveler, leader or guardian without a person publishing it, and no automated decision is made about a person.',
      ],
    },
    {
      title: 'How long it is kept',
      paragraphs: [
        'When a trip closes, a wrap-up window of 90 days starts (the organization may set 30 to 365 days). At its end the trip’s personal-data key is destroyed, which makes names, contacts, care notes, photos and chat unreadable. The itinerary template, head count statistics and anonymized timings are kept for the organization. Audit entries are kept without personal data.',
        'A person can ask to be deleted at any time; their row key is destroyed immediately and only an audit entry remains. Deleting an organization destroys its keys.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'You can ask to see, correct or delete the personal data held about you, and to receive a copy of it. Travelers and guardians ask through the organizer who runs the trip or directly at the address below. We answer within the time the applicable law allows. The organizer is the controller of roster and trip data entered on its behalf; At Day processes it to provide the service.',
      ],
    },
    {
      title: 'Children',
      paragraphs: [
        'Many travelers are minors. Their data is entered by the organizer and their guardian, never collected from them for advertising or sold. There are no ads in Voysemble and no sale or sharing of personal data with third parties for their own purposes. Traveler-to-traveler messaging does not exist by design.',
      ],
    },
    {
      title: 'Contact',
      paragraphs: ['At Day, operator of Voysemble. Privacy requests: privacy@voysemble.com.'],
    },
  ],
};

const termsEn: LegalDoc = {
  kind: 'terms',
  title: 'Terms of service',
  intro:
    'These terms apply between At Day (“we”) and the organization that creates a Voysemble organization (“you”), and, where they concern the apps, to the people you invite to a trip.',
  sections: [
    {
      title: 'The service',
      paragraphs: [
        'Voysemble is a group travel operations service: an organizer console on the web and apps for leaders, travelers and guardians. We provide the service as described on voysemble.com and in the product; features marked as pilot or preview may change.',
      ],
    },
    {
      title: 'Your organization and your responsibilities',
      paragraphs: [
        'You create the organization and are responsible for the trips, rosters and content entered under it. You confirm that you have the right to enter the names and contact details on a roster, including those of minors and their guardians, and that you will use the service lawfully and in line with your duty of care toward the people on the trip.',
        'Invite codes are personal. You hand each code to the person it was issued for.',
      ],
    },
    {
      title: 'Acceptable use',
      paragraphs: ['You and the people you invite will not:'],
      bullets: [
        'Upload content that is unlawful, that harasses, or that sexualizes minors; flagged photos are hidden for review and may be removed.',
        'Attempt to access another organization’s data or to circumvent roles, sealed links or encryption.',
        'Use the service to track a person outside the meeting windows the service provides.',
      ],
    },
    {
      title: 'Fees and billing',
      paragraphs: [
        'The organizer buys a license per trip (or a seat plan) and pays by card on the web through Stripe. Prices are shown before purchase. Voysemble does not collect fees from travelers or guardians; the fee ledger in the console records amounts you collect yourself.',
      ],
    },
    {
      title: 'Availability and support',
      paragraphs: [
        'We aim for the service to be available at all times but do not guarantee uninterrupted availability. The apps keep working offline for head counts, acknowledgments and the published itinerary and sync when a connection returns. Support is by email at the address below.',
      ],
    },
    {
      title: 'Data',
      paragraphs: [
        'Our privacy policy describes what is stored, who sees it and for how long. You remain the controller of the data you enter; we process it to provide the service and delete it on the schedule described there.',
      ],
    },
    {
      title: 'Liability',
      paragraphs: [
        'Voysemble supports the people running a trip; it does not replace their judgment or supervision. To the extent permitted by law, we are not liable for indirect or consequential loss, and our total liability for a trip is limited to the license fee paid for that trip.',
      ],
    },
    {
      title: 'Changes and termination',
      paragraphs: [
        'We may update these terms with notice on voysemble.com. You may stop using the service at any time; deleting the organization destroys its keys as described in the privacy policy. We may suspend an organization that breaches these terms.',
      ],
    },
    {
      title: 'Governing law and contact',
      paragraphs: [
        'Governing law and venue: to be confirmed in the reviewed version. Contact: legal@voysemble.com. At Day, operator of Voysemble.',
      ],
    },
  ],
};

const privacyKo: LegalDoc = {
  kind: 'privacy',
  title: '개인정보 처리방침',
  intro:
    'Voysemble은 단체여행을 운영하는 조직을 위해 At Day가 운영합니다. 이 방침은 서비스가 무엇을 저장하고, 누가 볼 수 있으며, 얼마나 보관하고, 여러분이 무엇을 요청할 수 있는지 설명합니다. 주최자는 조직을 대신해 데이터를 입력하고, 참가자·인솔자·보호자는 그 조직의 여행 아래에서 앱을 사용합니다.',
  sections: [
    {
      title: '서비스가 저장하는 것',
      paragraphs: [
        '여행 운영에 필요한 것만, 주최자·인솔자·참가자·보호자가 입력한 것만 저장합니다.',
      ],
      bullets: [
        '계정: 로그인에 쓰는 이메일 주소 또는 Apple·Google 아이덴티티, 로그인 유지와 분실 기기 회수에 필요한 세션·기기 기록.',
        '명단: 표시 이름, 조 이름, 여행 내 역할, 보호자와 참가자 한 명의 연결. 초대를 위해 입력한 보호자 연락처는 초대 발송에만 쓰이고 보관하지 않습니다.',
        '여행 운영: 일정과 리비전, 공지와 확인 응답, 인원 점검, 변경 제안, 사건 카드와 확인, 여행 고정 채널의 채팅 메시지.',
        '케어 노트: 보호자가 참가자를 위해 입력한 알레르기, 복용 약, 짧은 메모.',
        '서류: 주최자가 올린 여권·동의서 스캔(있는 경우).',
        '여행 사진첩에 올린 사진. 업로드 시 위치 메타데이터는 제거됩니다.',
        '집결 창: 참가자가 참여한 창이 열려 있는 동안의 안·밖·불확실·오래됨 상태. 좌표는 창 동안 메모리에서만 처리되며 저장소에 기록되지 않습니다.',
        '회비: 명단 행별 납부·미납·환불 금액의 주최자 장부. 카드 번호는 없으며, 주최자 라이선스 결제는 Stripe 페이지에서 Stripe가 처리합니다.',
        '감사 기록: 누가 언제 케어 노트나 서류를 열람했는지, 사건 중 채널을 열었는지, 기기를 회수했는지, 사건을 확인했는지.',
      ],
    },
    {
      title: '누가 무엇을 볼 수 있는가',
      paragraphs: [
        '접근 권한은 주최자가 초대 코드로 부여한 역할을 따릅니다. 아무도 자기 역할을 스스로 고르지 않습니다.',
      ],
      bullets: [
        '주최자(와 조직 소유자)는 조직의 모든 것을 봅니다. 단, 케어 노트는 참가자가 속한 조의 인솔자에게 표시되고, 서류 열람에는 재로그인이 필요합니다.',
        '인솔자는 자기 여행의 명단, 일정, 인원 점검, 확인 응답, 제안, 사건을 보고, 자기 조 참가자의 케어 노트를 기록이 남는 열람 뒤에서 봅니다.',
        '참가자는 확정 일정, 공지, 자기 확인 응답, 초대받은 집결 창, 여행 사진첩, 주최자가 공유한 경우 자기 회비 잔액을 봅니다.',
        '보호자는 확정 일정, 보호자용으로 표시된 공지, 내 참가자의 인원 점검 결과, 내 참가자에 관한 사건 상태 메시지, 승인된 사진첩, 자기 잔액을 봅니다. 보호자는 좌표, 객실 번호, 동기화 시각을 결코 보지 않습니다.',
        '기사, 호텔, 식당은 인원·시각·장소만 담긴 기한부 봉인 링크를 받고 이름은 받지 않습니다.',
        'At Day 직원은 감사 기록이 남는 관리 도구로 플랫폼 문제를 진단하며 여행 내용을 읽지 않습니다.',
      ],
    },
    {
      title: '어떻게 보호되는가',
      paragraphs: [
        '서비스는 Cloudflare 네트워크에서 동작합니다. 각 조직의 데이터는 격리된 자체 저장소에 보관됩니다. 개인정보 필드는 조직별 키로 암호화되고, 그 키는 서비스의 비밀 저장소에만 있는 키로 다시 감싸집니다. 서류와 사진 원본은 암호화되어 저장되며, 키는 버전이 관리되고 전체를 다시 쓰지 않고 교체됩니다.',
        '로그인은 일회용 링크, Apple·Google 아이덴티티, 그리고 평문이 한 번만 표시되고 해시로만 저장되는 초대 코드를 씁니다. 세션은 기기별로 회수할 수 있는 불투명 토큰입니다.',
      ],
    },
    {
      title: '자동화된 처리',
      paragraphs: [
        '휴대폰에서 모든 기계 학습은 기기 안에서 동작합니다. 주최자 쪽에서는 At Day의 Cloudflare 계정에 있는 Workers AI가 공지를 한국어와 영어 사이에서 번역하고, 검토가 필요한 사진(노출, 명단에 없는 미성년자의 근접 사진)에 플래그를 붙이고, 주최자가 제공한 문서에서 일정 항목을 제안하고, 주최자가 고칠 수 있는 재계획 초안을 씁니다. 제3자 AI 제공자는 여행 내용을 받지 않습니다. 이 도구가 만든 것은 사람이 배포하기 전에는 참가자·인솔자·보호자에게 닿지 않으며, 사람에 대한 자동화된 결정은 내려지지 않습니다.',
      ],
    },
    {
      title: '보관 기간',
      paragraphs: [
        '여행이 종료되면 90일의 마무리 기간이 시작됩니다(조직은 30일에서 365일 사이로 정할 수 있습니다). 기간이 끝나면 여행의 개인정보 키가 파기되어 이름, 연락처, 케어 노트, 사진, 채팅을 읽을 수 없게 됩니다. 일정 템플릿, 인원 점검 통계, 익명화된 시간 기록은 조직을 위해 남습니다. 감사 기록은 개인정보 없이 보관됩니다.',
        '누구든 언제든 삭제를 요청할 수 있습니다. 그 사람의 행 키는 즉시 파기되고 감사 기록만 남습니다. 조직을 삭제하면 조직의 키가 파기됩니다.',
      ],
    },
    {
      title: '정보주체의 권리',
      paragraphs: [
        '여러분은 자신에 관해 보관된 개인정보의 열람, 정정, 삭제와 사본 제공을 요청할 수 있습니다. 참가자와 보호자는 여행을 운영하는 주최자를 통해, 또는 아래 주소로 직접 요청합니다. 관련 법이 허용하는 기간 안에 답합니다. 조직을 대신해 입력된 명단과 여행 데이터의 개인정보처리자는 주최 조직이며, At Day는 서비스 제공을 위해 이를 처리합니다.',
      ],
    },
    {
      title: '아동',
      paragraphs: [
        '많은 참가자가 미성년자입니다. 이들의 데이터는 주최자와 보호자가 입력하며, 광고를 위해 수집되거나 판매되지 않습니다. Voysemble에는 광고가 없고, 제3자의 목적을 위한 개인정보 판매·공유가 없습니다. 참가자 간 메시지는 설계상 존재하지 않습니다.',
      ],
    },
    {
      title: '문의',
      paragraphs: ['Voysemble 운영자 At Day. 개인정보 관련 요청: privacy@voysemble.com.'],
    },
  ],
};

const termsKo: LegalDoc = {
  kind: 'terms',
  title: '이용약관',
  intro:
    '이 약관은 At Day(“회사”)와 Voysemble 조직을 만드는 조직(“귀하”) 사이에, 그리고 앱에 관한 한 귀하가 여행에 초대한 사람들에게 적용됩니다.',
  sections: [
    {
      title: '서비스',
      paragraphs: [
        'Voysemble은 단체여행 운영 서비스입니다. 웹의 주최자 콘솔과 인솔자·참가자·보호자용 앱으로 구성됩니다. 회사는 voysemble.com과 제품에 설명된 대로 서비스를 제공하며, 파일럿 또는 미리보기로 표시된 기능은 변경될 수 있습니다.',
      ],
    },
    {
      title: '귀하의 조직과 책임',
      paragraphs: [
        '귀하는 조직을 만들고 그 아래에 입력된 여행, 명단, 콘텐츠에 책임을 집니다. 귀하는 미성년자와 보호자를 포함해 명단의 이름과 연락처를 입력할 권한이 있음을, 그리고 서비스를 적법하게 여행 참가자에 대한 보호 의무에 맞게 사용할 것임을 확인합니다.',
        '초대 코드는 개인용입니다. 각 코드는 발급된 당사자에게 전달합니다.',
      ],
    },
    {
      title: '허용되는 사용',
      paragraphs: ['귀하와 귀하가 초대한 사람은 다음을 하지 않습니다.'],
      bullets: [
        '불법적이거나, 괴롭히거나, 미성년자를 성적으로 묘사하는 콘텐츠의 업로드. 플래그가 붙은 사진은 검토를 위해 숨겨지며 삭제될 수 있습니다.',
        '다른 조직의 데이터에 접근하거나 역할, 봉인 링크, 암호화를 우회하려는 시도.',
        '서비스가 제공하는 집결 창 밖에서 사람을 추적하기 위한 서비스 사용.',
      ],
    },
    {
      title: '요금과 결제',
      paragraphs: [
        '주최자는 여행당 라이선스(또는 좌석제 요금)를 구매하고 웹에서 Stripe를 통해 카드로 결제합니다. 가격은 구매 전에 표시됩니다. Voysemble은 참가자나 보호자에게서 회비를 걷지 않습니다. 콘솔의 회비 장부는 귀하가 직접 걷은 금액을 기록합니다.',
      ],
    },
    {
      title: '가용성과 지원',
      paragraphs: [
        '회사는 서비스가 항상 이용 가능하도록 노력하지만 중단 없는 가용성을 보장하지는 않습니다. 앱은 인원 점검, 확인 응답, 배포된 일정에 대해 오프라인에서도 동작하며 연결이 돌아오면 동기화합니다. 지원은 아래 주소의 이메일로 제공됩니다.',
      ],
    },
    {
      title: '데이터',
      paragraphs: [
        '개인정보 처리방침이 무엇을 저장하고, 누가 보고, 얼마나 보관하는지 설명합니다. 귀하는 입력한 데이터의 개인정보처리자로 남고, 회사는 서비스 제공을 위해 이를 처리하며 거기에 설명된 일정에 따라 삭제합니다.',
      ],
    },
    {
      title: '책임',
      paragraphs: [
        'Voysemble은 여행을 운영하는 사람들을 돕는 도구이며 그들의 판단과 감독을 대신하지 않습니다. 법이 허용하는 범위에서 회사는 간접 손해나 결과적 손해에 책임지지 않으며, 한 여행에 대한 회사의 총 책임은 그 여행에 지불된 라이선스 요금으로 제한됩니다.',
      ],
    },
    {
      title: '변경과 종료',
      paragraphs: [
        '회사는 voysemble.com의 공지와 함께 이 약관을 갱신할 수 있습니다. 귀하는 언제든 서비스 사용을 중단할 수 있으며, 조직을 삭제하면 개인정보 처리방침에 설명된 대로 조직의 키가 파기됩니다. 회사는 이 약관을 위반한 조직을 정지할 수 있습니다.',
      ],
    },
    {
      title: '준거법과 문의',
      paragraphs: [
        '준거법과 관할: 검토본에서 확정합니다. 문의: legal@voysemble.com. Voysemble 운영자 At Day.',
      ],
    },
  ],
};

export const legalDocs: Record<Locale, Record<LegalKind, LegalDoc>> = {
  en: { privacy: privacyEn, terms: termsEn },
  ko: { privacy: privacyKo, terms: termsKo },
};
