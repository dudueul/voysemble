// Copyright 2026- At Day. All rights reserved.
//
// English copy of the public site. English is the source language (D11); ko.ts mirrors this
// structure. Feature texts are written from the decisions named in `decision` and describe the
// decided product (D30). Keep sentences concrete: what the organizer, leader, traveler or
// guardian actually sees and taps.

import type { SiteContent } from './model.ts';

export const en: SiteContent = {
  locale: 'en',
  langName: 'English',
  otherLang: { label: '한국어', locale: 'ko' },
  meta: {
    title: 'Voysemble · Group travel operations for schools and youth organizers',
    description:
      'Run the trip after the booking is done: the published itinerary on every phone, head counts that close on the bus without signal, announcements that need a tap back, and a console where the organizer sees the whole group at once. Native iOS and Android apps for leaders, travelers and guardians.',
    ogTitle: 'Voysemble · Every traveler accounted for. Every parent reassured.',
    ogDescription:
      'Itinerary, head counts, announcements with acknowledgments, incidents and guardian updates for school and youth group travel. Offline on the bus, Korean and English, no location tracking.',
  },
  nav: {
    features: 'Features',
    roles: 'Who it is for',
    trust: 'Privacy',
    pricing: 'Pricing',
    faq: 'FAQ',
    console: 'Open the console',
    pilot: 'Request a pilot',
    menu: 'Menu',
  },
  hero: {
    eyebrow: 'For organizers of school and youth group travel',
    title: 'Every traveler accounted for. Every parent reassured.',
    lead: 'Voysemble runs the trip after the booking is done: the published itinerary on every phone, head counts that close on the bus without signal, announcements that need a tap back, and a console where the organizer sees the whole group at once.',
    primary: 'Request a pilot',
    secondary: 'Open the console',
    proof: [
      'Works offline on the bus',
      'Korean and English',
      'Status for parents, never coordinates',
      'Native iOS and Android apps',
    ],
    captureAlt:
      'The organizer console on day 4 of a sample tour: alerts that need attention, the next 48 hours, head count per bus, announcements with acknowledgment counts.',
  },
  roles: {
    title: 'Built for the four people on every trip',
    lead: 'One trip, four jobs. Each role gets exactly the screens and the data its job needs, and nothing that belongs to someone else.',
    items: [
      {
        id: 'organizer',
        name: 'Organizer',
        device: 'PC console',
        summary:
          'The teacher, coordinator or office that plans the trip, answers the parents and carries the responsibility.',
        bullets: [
          'Builds the itinerary and publishes numbered revisions.',
          'Imports the roster, hands out invite codes, keeps the fee ledger.',
          'Sees head counts, acknowledgments, incidents and proposals in one place.',
          'Opens an incident, asks a leader to confirm, and the parent gets a verified answer.',
        ],
      },
      {
        id: 'leader',
        name: 'Leader',
        device: 'Phone',
        summary:
          'The chaperone on the bus: a teacher, a parent volunteer, a coach. Five minutes and one hand free.',
        bullets: [
          'Opens a head count for their group and closes it even without signal.',
          'Sees who has not acknowledged an announcement and nudges them.',
          'Proposes an itinerary change from the phone; the organizer decides.',
          'Confirms an incident from where they stand, in one tap.',
        ],
      },
      {
        id: 'traveler',
        name: 'Traveler',
        device: 'Phone',
        summary: 'The student or member. One screen that says where to be, when, and what changed.',
        bullets: [
          'Today: the day’s plan in the local time zone, up next, delays and leader notes.',
          'Taps “Got it” on announcements that need it, even offline.',
          'Opts in to a meeting window when the leader asks, and nothing more.',
          'Adds photos to the trip pool and can delete their own anywhere.',
        ],
      },
      {
        id: 'guardian',
        name: 'Guardian',
        device: 'Phone',
        summary: 'The parent at home. Reassurance without surveillance, in their own language.',
        bullets: [
          'Sees the published itinerary and announcements the organizer shares with parents.',
          'Sees the head count result for their own child: on the bus, counted.',
          'Receives incident status messages confirmed by a named leader at a named time.',
          'Gets the approved photo album, their own balance and due date. Never a live map.',
        ],
      },
    ],
    widen:
      'Schools, academies, churches, youth orchestras and choirs, sports teams on tour. Any organized group with volunteer leaders and families at home fits the same four roles.',
  },
  phases: {
    title: 'Everything the trip needs, in the order the trip needs it',
    lead: 'From the first CSV to the day the data is shredded. Each feature below is a decision about how group travel should work, not a checkbox.',
    groups: [
      {
        id: 'before',
        title: 'Before the trip',
        lead: 'Ten minutes to a working trip, and a roster that is the source of truth.',
        features: [
          {
            id: 'first-run',
            title: 'Ten minutes to something useful',
            summary:
              'Create the organization in Korean or English, create a trip from the sample 13-day template or a blank one, import the roster, hand out codes. The dashboard shows a checklist until every step is done.',
            details: [
              'The sample trip means the console never looks empty: you can click through a complete tour before your own data exists.',
              'Every trip has a time zone, a start and an end date; days are numbered from the first day and every time on the trip is local wall-clock time.',
              'Nothing is published to phones until you say so.',
            ],
            decision: ['D26'],
            who: ['organizer'],
            capture: {
              file: 'setup-3-roster',
              alt: 'The setup checklist on the roster step: a CSV pasted in, rows counted, guardians bound to travelers.',
            },
          },
          {
            id: 'trips',
            title: 'Several trips, one console',
            summary:
              'A school runs more than one trip a year. The console works on one trip at a time: the organizer switches from the top bar or the Today page, creates the next trip where the list is, and every page follows at once.',
            details: [
              'Without a choice the trip that is on today is active, else the next to start, else the one that ended last; the choice is remembered per organization.',
              'The phones follow the same rule at sign-in, and a leader on two trips, or a guardian with two children, switches from the Today header.',
              'Each organizer sets their own name; it is what travelers, leaders and guardians read wherever the organizer acts: a chat message, an incident card, a fee row, the audit trail. The email stays private.',
            ],
            decision: ['D42', 'D21'],
            who: ['organizer', 'leader', 'guardian'],
            capture: {
              file: 'command-center-trips',
              alt: 'The Today page with three trips in the Trips panel, the one just created active in the top bar’s switch.',
            },
          },
          {
            id: 'roster',
            title: 'The roster is the source of truth',
            summary:
              'Import a CSV with name, group, guardian name and guardian contact. Every row becomes one person with one invite code. A guardian’s code is bound to exactly one traveler.',
            details: [
              'Roles come from the code, never from self-selection: a traveler cannot become a leader, and a stranger with the app cannot join a trip.',
              'Codes are shown once and exported as PDF or CSV to hand out on paper or by message; only their hashes are stored.',
              'One account per person for life: a leader works for several organizations, a student returns years later as a leader, and each organization’s data stays under its own key.',
              'The guardian contact is used for the invite only and is not kept.',
              'The People page shows each traveler’s fee beside their name, and the roster exports as a CSV at any time: name, role, group, the guardian’s traveler, invite status, last acknowledgment; never a contact.',
            ],
            decision: ['D12', 'D21'],
            who: ['organizer'],
            capture: {
              file: 'setup-4-invites',
              alt: 'Invite codes issued per roster row, shown once with their expiry and a CSV download.',
            },
          },
          {
            id: 'itinerary',
            title: 'An itinerary editor that publishes revisions',
            summary:
              'Plan day by day on the console: meals, buses, activities, meetings, with places, times and head counts per event. Publish when the plan is ready; every phone gets the same revision.',
            details: [
              'Draft and published are separate. Edits accumulate as unpublished changes and go out together as revision 2, 3, 4; old revisions are kept.',
              'One writer per trip: the organizer console. No merge conflicts between ten phones editing the same day.',
              'Delays and leader notes show on the published plan without a new revision.',
            ],
            decision: ['D24', 'D19'],
            who: ['organizer'],
            capture: {
              file: 'itinerary-proposal',
              alt: 'The itinerary editor with a leader’s change proposal waiting above the day timeline.',
            },
          },
          {
            id: 'care-notes',
            title: 'Care notes where they are needed, documents where they are safe',
            summary:
              'An allergy, a medication, a short note: the guardian enters it during the invite flow. The leaders of that traveler’s group can reveal it behind an eye icon on the head count and the person card. Every reveal is recorded.',
            details: [
              'Care notes are personal data: encrypted at rest and decrypted only for the leaders of that group, never for the whole trip.',
              'Passport and consent scans live on the organizer console only: revealing one needs a fresh sign-in, the view is watermarked, and they are never sent to a phone.',
              'A parental consent that is still missing shows up as a reminder on the console, with the due date.',
              'Reminders go out by themselves on the mornings three days and one day before a document is due, to the travelers still missing it and their guardians; the organizer can nudge on any day, once a day per person.',
            ],
            decision: ['D27'],
            who: ['organizer', 'leader', 'guardian'],
          },
          {
            id: 'sealed-links',
            title: 'Drivers and hotels without accounts',
            summary:
              'A bus driver, a hotel: they get a sealed, time-limited link with exactly their slice, no account. The driver’s sheet is the names on the bus and the times; the hotel’s sheet is the rooming list by room.',
            details: [
              'Links are shown once, expire with the trip and can be revoked at any moment from the console; every opening is counted.',
              'Never a contact, a guardian, a care note or a document. Leaders read the rooming list on the phone at the hotel, and during the stay the head count rows carry the room numbers.',
              'Each traveler reads their own room and who shares it on Today while the stay lasts, and nothing more of the list; guardians never see rooms.',
            ],
            decision: ['D27', 'D39', 'D41'],
            who: ['organizer'],
          },
          {
            id: 'fees',
            title: 'Fees without card forms',
            summary:
              'Trip fees are a ledger: paid, unpaid or refunded per roster row, entered by hand or from a bank CSV. Guardians see their own balance and due date on the phone. Nobody types a card number into the app.',
            details: [
              'The organizer’s own license is paid by card on the web with Stripe; families are never billed through Voysemble.',
              'The ledger exports as a CSV from the Billing page, every traveler in roster order with the balance, so the end-of-trip accounting is one download.',
            ],
            decision: ['D23'],
            who: ['organizer', 'guardian'],
            capture: {
              file: 'billing',
              alt: 'The billing page: the trip license and the traveler fee ledger with paid, unpaid and refunded rows.',
            },
          },
          {
            id: 'settings',
            title: 'Settings that match the decisions',
            summary:
              'Quiet hours and the guardian digest hour, the wrap-up window before a trip’s data is shredded, the organization’s language and time zone, and who is on the console. Each saved on the API, each starting from the decision’s default.',
            details: [
              'Only the owner changes them; organizers see the values and a hint. The member list shows every account with its role.',
              'Required-ack announcements and head-count calls cross quiet hours; everything else waits for morning.',
            ],
            decision: ['D29', 'D20', 'D21'],
            who: ['organizer'],
            capture: {
              file: 'settings-live',
              alt: 'The Settings page: organization profile, notification rules, retention window and the members list, saved on the API.',
            },
          },
        ],
      },
      {
        id: 'during',
        title: 'On the trip',
        lead: 'Buses and mountains have no signal, leaders have five minutes, parents have questions. Every screen here was designed for that.',
        features: [
          {
            id: 'today',
            title: 'Today, on every phone',
            summary:
              'The day’s events in the trip’s time zone, what is up next, delays and leader notes, the announcement that still needs a tap, the head count status per group. It works from the last published revision when the signal drops.',
            details: [
              'Day 4, Thursday, 07:12 in Rome: breakfast, the lobby meeting moved to 07:30 by the leader, the buses at 08:00, the Colosseum at 09:00.',
              'The same screen, read-only, on the guardian’s phone at home.',
              'The packing list opens from its card and the inbox from the bell: what the lanes delivered, with “Open” leading to the plan, the head count or the packing list.',
              '“Your room tonight” while a hotel stay covers the day: the room and who shares it, or the hotel and whom to ask before the organizer placed them.',
              'For a traveler, “I need help”: lost, sick or unsure where to go, in their own words or none; the card then reads “Your leaders and the organizer know” until a leader has answered and the organizer resolved it.',
            ],
            decision: ['D24', 'D13', 'D41', 'D17'],
            who: ['traveler', 'leader', 'guardian'],
          },
          {
            id: 'plan',
            title: 'The whole plan in a pocket',
            summary:
              'Every day of the published itinerary on the phone, one day at a time, with the organizer’s labels. Leaders propose from any event: a new time, a removal, or a new event for the day.',
            details: [
              'The day picker opens on today; before departure it opens on day one.',
              'An add proposal carries the whole event, so the organizer accepts it with one tap and publishes as usual.',
              'Travelers and guardians read; leaders propose; the organizer decides on the console.',
            ],
            decision: ['D24'],
            who: ['traveler', 'leader', 'guardian'],
          },
          {
            id: 'headcount',
            title: 'Head counts that close on the bus',
            summary:
              'The leader opens a head count for their group, taps each name present, and closes it. Without signal it closes anyway and shows “Pending sync” until the server has it. Nothing is ever counted twice.',
            details: [
              'The missing list is pinned on top with name, room, last acknowledgment and the last meeting-window status. One tap to call, one tap to push “Come to Bus A now”, one tap to mark “with the other group” or “excused”.',
              'One leader per group per head count, so there are no conflicts to resolve when the bus gets signal back.',
              'If someone is still missing at close, the head count closes with the names, the console tile turns amber, and an incident card opens by itself.',
              'The console shows every group’s latest count, short counts in amber, and the “checked in” total for the whole trip.',
              'The console’s Safety page lists who is missing right now, per group, from the latest closed count.',
            ],
            decision: ['D14', 'D25'],
            who: ['leader', 'organizer', 'guardian'],
            capture: {
              file: 'safety-missing-live',
              alt: 'The Safety page’s missing list: Bus A closed at 06:58 by Kim with one traveler missing, and the marks a leader can set.',
            },
          },
          {
            id: 'announcements',
            title: 'Announcements with a required “Got it”',
            summary:
              'Read receipts lie on sleeping phones. An announcement can require an acknowledgment: the traveler taps “Got it”, even offline, and the leader sees the list of who has not, live.',
            details: [
              'From that list the leader can schedule a nudge push or take the names to the room check.',
              'Korean and English: the organizer writes in one, Voysemble adds a machine translation in the other, labelled as machine translation with the original always shown. The organizer can correct the translation.',
              'Guardians receive an announcement only when it is marked “share with guardians”.',
            ],
            decision: ['D16'],
            who: ['organizer', 'leader', 'traveler', 'guardian'],
            capture: {
              file: 'communication-live',
              alt: 'The Communication page: an announcement with its Korean machine translation, the acknowledgment meter and the names still missing.',
            },
          },
          {
            id: 'revision-diff',
            title: 'Changes of plan that everyone sees and confirms',
            summary:
              'When the organizer publishes a new revision, every traveler and leader gets the difference as plain lines, “Day 4: Colosseum guided tour now 08:30 (was 09:00)”, with a required acknowledgment. Guardians get the same safe summary.',
            details: [
              'Only days from today onward trigger the notice; cleaning up yesterday stays quiet. The organizer can also publish quietly for a typo.',
              'The lines are fixed template text in both languages, never paraphrased by AI, so a change of plan always reads the same way.',
              'Revision history is kept: who published what and when, for the whole trip.',
            ],
            decision: ['D19'],
            who: ['organizer', 'leader', 'traveler', 'guardian'],
          },
          {
            id: 'proposals',
            title: 'Leaders propose, the organizer publishes',
            summary:
              'A leader on the ground can propose an edit, an addition or a removal from the phone, with a note. The organizer accepts or rejects it in the editor and publishes the result.',
            details: [
              'Proposals queue offline and go out when the phone reconnects.',
              'Accepted proposals become unpublished changes in the draft, so the organizer still controls what goes to every phone and when.',
            ],
            decision: ['D24'],
            who: ['leader', 'organizer'],
          },
          {
            id: 'meeting-windows',
            title: 'Meeting windows, not tracking',
            summary:
              'There is no live map of the group. When it matters, the leader opens a meeting window: a time range and a place with a radius. Each traveler opts in for that window only, and the leader sees inside, outside, uncertain or stale.',
            details: [
              'Sharing stops by itself when the window ends. Coordinates are kept in memory for the window and never written to a database.',
              'Guardians never see meeting windows. They see the head count result, not the dot.',
            ],
            decision: ['D15'],
            who: ['leader', 'traveler'],
          },
          {
            id: 'incidents',
            title: 'Incidents with a human answer',
            summary:
              'A missing name at close, a lost phone, a late bus. The organizer opens an incident card, pings a leader to confirm, and the leader answers from the phone: with the group, with another group, found. The guardian receives a status message naming the leader and the time.',
            details: [
              'The per-person timeline on the console shows syncs, head counts, acknowledgments, leader-tagged photos and notes, so the organizer answers from evidence.',
              'The guardian message is sent in the guardian’s language and reads like a person wrote it: “Minji Park is with the group. Phone lost. Confirmed by leader Kim Daeun at 15:42.”',
              'Photos are attached only when the organizer chooses to. Every step is audited.',
              'For what the head count did not catch, a lost passport or a sick traveler, the organizer opens a card by hand naming the travelers; the same flow follows, and the guardians and leaders hear it at once.',
              'A leader opens a card from the phone too, naming travelers of their group; a traveler asks for help from Today in their own words. Either way the owners and organizers, who have no app, get an email at once with the words and the link to the Safety page; a traveler asks once until it is resolved.',
            ],
            decision: ['D17', 'D29'],
            who: ['organizer', 'leader', 'guardian'],
            capture: {
              file: 'safety-live',
              alt: 'The Safety page with an open incident card from a short head count and a resolved one with its guardian message.',
            },
          },
          {
            id: 'photos',
            title: 'Photos leaders approve',
            summary:
              'Travelers and leaders upload to the trip pool. Leaders approve photos one by one for the guardian album. Flagged photos stay hidden until a leader has looked.',
            details: [
              'Automatic flags for nudity and for close-ups of minors who are not on the roster, reviewed by a person before anything reaches a parent.',
              'Location data is stripped from every photo on upload. Originals are stored encrypted.',
              'The uploader can delete their own photo everywhere, at any time.',
            ],
            decision: ['D18'],
            who: ['traveler', 'leader', 'guardian'],
            capture: {
              file: 'media',
              alt: 'The Media page: the trip photo pool with flagged items hidden and the approved guardian album.',
            },
          },
          {
            id: 'chat',
            title: 'Chat with fixed channels',
            summary:
              'Everyone on the trip, each group with its leader, each traveler with their leader, each guardian with the organizer. No traveler-to-traveler messages and no guardian-to-leader thread.',
            details: [
              'A leader removes a message in their group’s channels, the sender their own, the organizer in theirs; a tombstone stays in place for everyone. While an incident names a traveler, the organizer reads that traveler’s channel and their group’s from the incident card, and every read lands on the traveler’s timeline.',
              'Each channel card speaks the reader’s language, Korean or English.',
              'Fixed channels keep minors out of private threads and keep volunteer leaders out of parent conversations.',
            ],
            decision: ['D22'],
            who: ['organizer', 'leader', 'traveler', 'guardian'],
            capture: {
              file: 'communication-chat',
              alt: 'Communication: the guardian’s channel with the organizer, the thread and the composer.',
            },
          },
          {
            id: 'disruption',
            title: 'Disruption replanning',
            summary:
              'A flight is 75 minutes late and ten late joiners miss the transfer. The organizer marks the day as disrupted; Voysemble drafts two or three replans with an explanation of what moves and why. The organizer edits one and publishes it as a new revision.',
            details: [
              'The drafts are suggestions in the editor, never a change on anyone’s phone. The organizer stays the single publisher.',
              'The published revision goes out as the usual change notice with required acknowledgments and the guardian summary.',
              'The drafts come from a model at the edge, answering in a fixed shape; the journey graph beside the editor shows the tight connections of the day, so the organizer sees what a slip breaks before publishing.',
            ],
            decision: ['D19'],
            who: ['organizer'],
          },
          {
            id: 'notifications',
            title: 'Notifications that respect sleep',
            summary:
              'Fourteen pushes on day one make guardians uninstall. Guardians get one daily digest at the hour the organization sets, and immediate pushes only for incident status and shared announcements.',
            details: [
              'Travelers: required acknowledgments and head count calls are priority and get through a muted phone; everything else is normal and can be muted.',
              'Leaders get everything immediately. Quiet hours per trip, 23:00 to 06:30 by default, hold everything except priority.',
              'The mornings three days and one day before departure remind everyone with packing left; guardians get the digest by email, and an incident’s status reaches them at once.',
              'Owners and organizers have no app: a card opened from a phone, a traveler’s help request or a leader’s card, reaches their mailbox at once, in their language, with the traveler’s words and the Safety link.',
            ],
            decision: ['D29'],
            who: ['traveler', 'leader', 'guardian'],
          },
          {
            id: 'lost-device',
            title: 'A lost phone is not a lost roster',
            summary:
              'Volunteers use personal phones. From the person card the organizer revokes a device: every session ends, the next sync is refused and wipes the local cache, and the person re-enrols with their code on a new phone with their groups restored.',
            details: [
              'The local cache is encrypted with a key held in the phone’s secure hardware; cached personal data expires after 24 hours and is cleared when the phone locks in the background; chat is cached for seven days.',
            ],
            decision: ['D28'],
            who: ['organizer', 'leader', 'traveler'],
          },
        ],
      },
      {
        id: 'after',
        title: 'After the trip',
        lead: 'What you keep, what you shred, and what next year’s trip starts from.',
        features: [
          {
            id: 'reports',
            title: 'Reports and the person timeline',
            summary:
              'Acknowledgment rate per day, minutes to close the head count, open incidents and fees collected, derived from the facts the service already holds. The same evidence the organizer used during the trip, summarized after it.',
            details: [
              'Charts with a table view for every number, so a report to the school board or the parents’ association is a screenshot away.',
              'A CSV export with a stable header, one row per trip day, for the spreadsheet the treasurer already keeps.',
            ],
            decision: ['D17'],
            who: ['organizer'],
            capture: {
              file: 'reports-live',
              alt: 'The live Reports page after one closed head count and one announcement: four tiles and two day charts.',
            },
          },
          {
            id: 'retention',
            title: 'Retention you can explain to parents',
            summary:
              'When a trip closes, a 90-day wrap-up window starts. Then the trip’s personal-data key is destroyed: names, contacts, photos and chat become unreadable. The itinerary template, head count statistics and anonymized timings are kept.',
            details: [
              'A person can ask to be deleted at any time; their row key is shredded immediately and only an audit entry remains.',
              'The organization chooses its default between 30 and 365 days.',
              'Designed for the Korean Personal Information Protection Act and the GDPR: minimal data, explicit purpose, bounded lifetime.',
            ],
            decision: ['D20'],
            who: ['organizer', 'guardian'],
          },
          {
            id: 'templates',
            title: 'Next year starts from this year',
            summary:
              'The itinerary survives the shredding as a template without people in it. Next year’s organizer starts from a plan that already worked, with last year’s timings next to it.',
            details: ['Multi-year insight without multi-year personal data.'],
            decision: ['D20'],
            who: ['organizer'],
          },
        ],
      },
    ],
  },
  phones: {
    title: 'The phones, as they are',
    lead: 'Real captures from the apps’ own test runs, not drawings: iPhone on iOS 26 with Liquid Glass and Android, in English and Korean.',
    caption:
      'Captured by the apps’ test suites on the iOS simulator and an Android emulator (Korea Concert Tour, day 4 in Rome). Names are synthetic.',
    shots: [
      {
        platform: 'ios',
        file: 'today-light',
        alt: 'Today on iPhone: the up-next card with the meeting point, the announcement to acknowledge, the head count per group, the glass tab bar.',
        label: 'Today on iPhone',
      },
      {
        platform: 'ios',
        file: 'plan-day',
        alt: 'The Plan tab on iPhone: day pills, the concert day’s events, and the leader’s “Propose a change” on each.',
        label: 'The Plan tab',
      },
      {
        platform: 'android',
        file: 'plan-day',
        alt: 'The Plan tab on Android with the same day picker and events.',
        label: 'The Plan tab on Android',
      },
      {
        platform: 'ios',
        file: 'today-ko',
        alt: 'Today on iPhone in Korean.',
        label: 'Today, in Korean',
      },
      {
        platform: 'android',
        file: 'headcount-open',
        alt: 'An open head count on Android: Bus A, the missing list on top, one tap per name.',
        label: 'Head count on Android',
      },
      {
        platform: 'ios',
        file: 'chats-thread-dark',
        alt: 'A chat thread on iPhone in dark mode with a message pending.',
        label: 'Chats, dark mode',
      },
      {
        platform: 'android',
        file: 'today-trip-switch',
        alt: 'The trip switch on Android: the account’s trips with their days and roles, the current one marked.',
        label: 'Switching trips',
      },
      {
        platform: 'ios',
        file: 'rooming-light',
        alt: 'The rooming list on iPhone: the hotel, the rooms by number with the names in them, who has no room yet.',
        label: 'The rooming list',
      },
      {
        platform: 'ios',
        file: 'inbox-light',
        alt: 'The inbox on iPhone: what the lanes delivered, each row with Open and Mark read.',
        label: 'The inbox',
      },
      {
        platform: 'android',
        file: 'today-help',
        alt: 'Today on Android scrolled to the “Need help?” card with a request on its way: the traveler’s words and “Your leaders and the organizer know”.',
        label: 'Asking for help',
      },
      {
        platform: 'ios',
        file: 'today-room',
        alt: '“Your room tonight” on iPhone: Room 412 at the hotel with the roommate, and a stay before the organizer placed the traveler.',
        label: 'Your room tonight',
      },
      {
        platform: 'ios',
        file: 'incidents-new',
        alt: 'The form a leader fills on iPhone to open an incident card by hand: what happened and the group’s travelers as toggles.',
        label: 'A card from the phone',
      },
    ],
  },
  trust: {
    title: 'Privacy by design, because the travelers are minors',
    lead: 'Reassurance for parents is a product requirement. Surveillance is not. These rules are built in, not configured.',
    items: [
      {
        title: 'Guardians see status, never coordinates',
        body: 'A parent sees the head count result for their child, the published itinerary, the announcements the organizer shares, approved photos. No live map, no room numbers, no sync timestamps that invite false alarms.',
      },
      {
        title: 'No ambient tracking',
        body: 'Location exists only inside a meeting window the leader opens and the traveler joins. It stops when the window ends and is never stored.',
      },
      {
        title: 'Encryption in tiers',
        body: 'Personal fields are encrypted per organization with versioned keys. Documents are encrypted in storage. Keys rotate without rewriting everything, and deleting an organization destroys its keys.',
      },
      {
        title: 'No card data, ever',
        body: 'Organizers pay their license through Stripe’s hosted pages. Families never enter a card. Free text is scanned so a card number pasted by mistake is not stored.',
      },
      {
        title: 'AI stays in its lane',
        body: 'On phones, AI runs on the device only. On the organizer side, Voysemble’s own Workers AI translates announcements, flags photos and drafts replans. Nothing an AI writes reaches a phone without a person publishing it, and change notices are never paraphrased.',
      },
      {
        title: 'Every reveal is audited',
        body: 'Opening a care note, a document, a chat channel during an incident, revoking a device: each is recorded with who and when, visible to the organization’s owner.',
      },
      {
        title: 'Minors first',
        body: 'No traveler-to-traveler messages, photo flags reviewed by a person, guardian codes bound to one child, roles that cannot be self-selected.',
      },
      {
        title: 'One operator, isolated organizations',
        body: 'Each organization’s data lives in its own store under its own key. Platform staff diagnose problems through audited tools without reading trip content.',
      },
    ],
  },
  platform: {
    title: 'Native apps, a PC console, one edge',
    lead: 'Built for the devices people actually carry and the places trips actually go.',
    items: [
      {
        title: 'Native iOS and Android',
        body: 'SwiftUI and Jetpack Compose on a shared Kotlin core. No web view, no JavaScript runtime in the app, background work the OS trusts. On iOS 26 the controls take Liquid Glass; older phones keep the flat look.',
      },
      {
        title: 'Offline first',
        body: 'Head counts, acknowledgments and proposals queue on the phone and sync once. The published itinerary is cached. The app says “Pending sync” and “Offline” instead of pretending.',
      },
      {
        title: 'The organizer console in a browser',
        body: 'A PC application: itinerary editor, roster, communication, safety, reports, billing. Works on a laptop at the hotel desk and on a tablet on the bus.',
      },
      {
        title: 'Korean and English',
        body: 'Every screen in both: the console follows the account’s language with a one-tap switch, the phones follow the device. Announcements translated by machine and labelled as such, with the original always shown.',
      },
      {
        title: 'Sign in without passwords',
        body: 'A magic link by email, Apple and Google sign-in, invite codes that join the organization and the trip in one step.',
      },
      {
        title: 'Cloudflare’s edge',
        body: 'Served close to Seoul and close to Rome. Per-organization isolation by construction, previews per build, no servers to patch.',
      },
    ],
  },
  pricing: {
    title: 'One license per trip',
    lead: 'The organizer buys a license for a trip. Everyone on that trip uses Voysemble for free: leaders, travelers, guardians, drivers with their links.',
    plan: {
      name: 'Trip license',
      who: 'Billed to the organizing organization, by card on the web.',
      includes: [
        'Unlimited leaders, travelers and guardians on the trip',
        'Every feature on this page, in Korean and English',
        'Native apps for everyone, the console for organizers',
        'The 90-day wrap-up and the retention schedule you choose',
        'Sealed links for drivers, hotels and venues',
      ],
      note: 'Pilot organizations run their first trip with us at pilot pricing. Tell us the trip and the dates.',
      cta: 'Request pilot pricing',
    },
    ledger: {
      title: 'Traveler fees stay yours',
      body: 'Voysemble never charges families. Fees you collect are a ledger in the console: paid, unpaid, refunded per person, entered by hand or from your bank’s CSV, visible to each guardian as their own balance.',
    },
    seats: 'Organizations that run many trips a year can move to a seat plan. Ask us.',
  },
  faq: {
    title: 'Questions organizers ask',
    items: [
      {
        q: 'Does every traveler need to install an app?',
        a: 'Travelers, leaders and guardians use the iOS or Android app; it is where Today, head counts and acknowledgments live. Drivers, hotels and venues do not install anything: they get a sealed link or a printout.',
      },
      {
        q: 'Does it track my child’s location?',
        a: 'No. Guardians see status, never coordinates. Location exists only inside a meeting window a leader opens and the traveler joins for that window, and it is never stored.',
      },
      {
        q: 'What happens on the bus without signal?',
        a: 'The leader opens and closes the head count anyway; it shows “Pending sync” until the server confirms. Travelers tap “Got it” and the tap is queued. The published itinerary is cached on every phone.',
      },
      {
        q: 'Who can see an allergy or a medication note?',
        a: 'The leaders of that traveler’s group, behind an eye icon on the head count and the person card. Each reveal is recorded. The organizer never needs to read it to run the trip.',
      },
      {
        q: 'Which languages?',
        a: 'Korean and English on every screen. An announcement written in one language gets a machine translation in the other, labelled as machine translation, with the original always shown. The organizer can correct it.',
      },
      {
        q: 'How are photos handled?',
        a: 'Uploads go to the trip pool. Automatic flags hide nudity and close-ups of minors who are not on the roster until a leader reviews. Leaders approve photos for the guardian album one by one. Location data is stripped on upload and the uploader can delete their own photo anywhere.',
      },
      {
        q: 'How long do you keep the data?',
        a: 'Ninety days after the trip closes, the trip’s personal-data key is destroyed. Names, contacts, photos and chat become unreadable; the itinerary template and anonymized statistics remain. Your organization can set a shorter or longer default between 30 and 365 days, and any person can be deleted immediately on request.',
      },
      {
        q: 'Can a leader change the itinerary?',
        a: 'A leader proposes an edit, an addition or a removal from the phone, with a note. The organizer accepts or rejects it in the editor and publishes. One writer per trip means no conflicting versions.',
      },
      {
        q: 'Can parents pay through the app?',
        a: 'No, by design. Fees are a ledger the organizer keeps; guardians see their own balance and due date. Only the organizer’s license is paid by card, on the web, through Stripe’s hosted pages.',
      },
      {
        q: 'Which devices and browsers?',
        a: 'iPhone and Android phones for the apps. The organizer console runs in a current browser on a PC, a laptop or a tablet.',
      },
    ],
  },
  cta: {
    title: 'Run your next trip with Voysemble',
    body: 'Tell us about the trip, the group and the dates. A pilot starts with the sample tour on the console and your own roster the same day.',
    primary: 'Request a pilot',
    secondary: 'Open the console',
  },
  footer: {
    tagline: 'Group travel operations for schools and youth organizers.',
    product: 'Product',
    legal: 'Legal',
    privacy: 'Privacy',
    terms: 'Terms',
    company: 'Voysemble is a product of At Day.',
    copyright: '© 2026 At Day. All rights reserved.',
  },
  legal: {
    draftNotice:
      'Draft, under review. This text describes how Voysemble is designed to handle data and is not yet in force. The reviewed version will replace it at this address.',
    backHome: 'Back to voysemble.com',
    updated: 'Last updated',
  },
};
