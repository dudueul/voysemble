// Copyright 2026- At Day. All rights reserved.
//
// Mobile Today screen (first mobile visual-acceptance view, doc 01 §18.4). Benchmarks screen
// atlas #2: trip header with day + sync state, green "Up next" card, latest announcement with
// acknowledgment, head count, later-today list, five bottom tabs. Status is never color-only.

package com.voysemble.app.today

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import com.voysemble.core.api.CareNoteDto
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.voysemble.core.today.GuardianCard
import com.voysemble.core.today.GuardianTone
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.core.plan.ProposalKind
import com.voysemble.core.plan.proposalSentMessage
import com.voysemble.core.today.AckState
import com.voysemble.core.today.EventKind
import com.voysemble.core.today.EventStatus
import com.voysemble.core.today.HeadcountGroup
import com.voysemble.core.today.TodayAnnouncement
import com.voysemble.core.today.TodayEvent
import com.voysemble.core.today.TodaySnapshot

@Composable
fun TodayRoute(vm: TodayViewModel, onOpenHeadcount: () -> Unit = {}, onOpenWindow: () -> Unit = {}, onOpenIncidents: () -> Unit = {}) {
    val state by vm.state.collectAsStateWithLifecycle()
    // D24: the shared dialog (ProposeChange.kt); change or remove the up-next event.
    var proposing by remember { mutableStateOf<ProposalTarget?>(null) }
    proposing?.let { target ->
        ProposeChangeDialog(
            target = target,
            onDismiss = { proposing = null },
            onSend = { draft ->
                vm.propose(draft)
                proposing = null
            },
        )
    }
    TodayScreen(
        state = state,
        onAcknowledge = { vm.acknowledge(it) },
        onSelectTab = vm::selectTab,
        onOpenHeadcount = onOpenHeadcount,
        onOpenWindow = onOpenWindow,
        onOpenIncidents = onOpenIncidents,
        onPropose = { id -> state.snapshot.events.firstOrNull { it.id == id }?.let { proposing = ProposalTarget.forEvent(it) } },
        onEditCare = { vm.editCare() },
        onCancelCare = vm::cancelCare,
        onSaveCare = { vm.saveCare(it) },
        onDismissProposal = vm::dismissProposal,
    )
}

@Composable
fun TodayScreen(
    state: TodayUiState,
    onAcknowledge: (String) -> Unit,
    onSelectTab: (MainTab) -> Unit,
    onOpenHeadcount: () -> Unit = {},
    onOpenWindow: () -> Unit = {},
    onOpenIncidents: () -> Unit = {},
    onPropose: (eventId: String) -> Unit = {},
    onDismissProposal: () -> Unit = {},
    onEditCare: () -> Unit = {},
    onCancelCare: () -> Unit = {},
    onSaveCare: (CareNoteDto) -> Unit = {},
) {
    val snap = state.snapshot
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { BottomTabs(selected = state.tab, onSelect = onSelectTab) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { Header(snap, live = state.live, syncing = state.syncing) }
            if (snap.offline) item { OfflineBanner(snap) }
            snap.upNext?.let { next -> item { UpNextCard(next, snap.timeZoneLabel, onOpenWindow, canPropose = state.canPropose, onPropose = { onPropose(next.id) }, proposal = state.proposal?.takeIf { it.eventId == next.id }, onDismissProposal = onDismissProposal) } }
            snap.announcement?.let { a -> item { AnnouncementCard(a, onAcknowledge) } }
            val guardian = state.guardian
            if (guardian != null) {
                // D13: the guardian's card replaces the head count card and the leader links.
                item { GuardianStatusCard(guardian) }
                // D27 (slice 032): the guardian writes the care note here; leaders reveal it at the count.
                state.care?.let { care -> item { GuardianCareCard(care, onEditCare, onCancelCare, onSaveCare) } }
            } else {
                item { HeadcountCard(snap.headcount, snap.checkedIn, snap.expected, onOpenHeadcount, onOpenIncidents) }
            }
            item { SectionTitle(tr(Txt.TODAY_LATER)) }
            items(snap.later, key = { it.id }) { e -> EventRow(e) }
            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun Header(snap: TodaySnapshot, live: Boolean = false, syncing: Boolean = false) {
    val c = LocalVoysembleColors.current
    Column {
        Text(
            text = trf(Txt.TODAY_EYEBROW, snap.tripName.uppercase(), snap.dayNumber),
            style = MaterialTheme.typography.labelSmall,
            color = c.textMuted,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr(Txt.TODAY_TITLE), style = MaterialTheme.typography.headlineLarge)
            Spacer(Modifier.weight(1f))
            if (live) LabelChip(if (syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check) else SampleChip()
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${snap.dateLabel} · ${snap.timeZoneLabel}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            Text("·", color = c.textMuted)
            Icon(AppIcons.Sync, contentDescription = null, tint = c.success, modifier = Modifier.size(14.dp))
            Text(
                text = when (val m = snap.minutesSinceSync) {
                    null -> tr(Txt.COMMON_NOT_SYNCED_YET)
                    0 -> tr(Txt.COMMON_SYNCED_JUST_NOW)
                    else -> trf(Txt.COMMON_SYNCED_MIN_AGO, m)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = c.textMuted,
            )
        }
    }
}

@Composable
private fun SampleChip() {
    val c = LocalVoysembleColors.current
    Text(
        tr(Txt.COMMON_SAMPLE_DATA),
        style = MaterialTheme.typography.labelSmall,
        color = c.pending,
        modifier = Modifier
            .border(1.dp, c.pending.copy(alpha = 0.35f), RoundedCornerShape(999.dp))
            .background(c.pending.copy(alpha = 0.10f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    )
}

@Composable
private fun OfflineBanner(snap: TodaySnapshot) {
    val c = LocalVoysembleColors.current
    Row(
        modifier = Modifier.fillMaxWidth().background(c.warning.copy(alpha = 0.14f), MaterialTheme.shapes.small).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(AppIcons.Offline, contentDescription = null, tint = c.warning, modifier = Modifier.size(18.dp))
        Text(tr(Txt.COMMON_OFFLINE_LAST_PLAN), style = MaterialTheme.typography.bodyMedium, color = c.warning)
    }
}

@Composable
private fun UpNextCard(
    e: TodayEvent,
    tz: String,
    onOpenWindow: () -> Unit,
    canPropose: Boolean = true,
    onPropose: () -> Unit = {},
    proposal: ProposalState? = null,
    onDismissProposal: () -> Unit = {},
) {
    val c = LocalVoysembleColors.current
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = c.action,
        contentColor = c.onAction,
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = trf(Txt.TODAY_UP_NEXT_A11Y, e.title, e.start) },
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(tr(Txt.TODAY_UP_NEXT), style = MaterialTheme.typography.labelSmall, color = c.onAction.copy(alpha = 0.8f))
            Text(e.title, style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = if (e.end != null) "${e.start} – ${e.end}" else e.start,
                    style = MaterialTheme.typography.headlineLarge,
                )
                Text(tz, style = MaterialTheme.typography.bodyMedium, color = c.onAction.copy(alpha = 0.8f))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(AppIcons.Pin, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(e.place, style = MaterialTheme.typography.bodyLarge)
            }
            e.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.onAction.copy(alpha = 0.85f)) }
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = onOpenWindow,
                colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.16f), contentColor = c.onAction),
                shape = MaterialTheme.shapes.small,
            ) {
                Icon(AppIcons.Map, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(if (e.isMeetingPoint) tr(Txt.TODAY_MEETING_POINT) else tr(Txt.TODAY_DIRECTIONS))
            }
            // D24: leaders propose; the organizer decides on the console.
            if (canPropose) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onPropose, enabled = proposal?.sending != true) {
                    Text(
                        when {
                            proposal?.sending == true -> tr(Txt.TODAY_SENDING_PROPOSAL)
                            proposal?.sent == true -> proposalSentMessage(proposal?.kind ?: ProposalKind.EDIT)
                            else -> tr(Txt.TODAY_PROPOSE_CHANGE)
                        },
                        color = c.onAction,
                    )
                }
                if (proposal != null && !proposal.sending) {
                    TextButton(onClick = onDismissProposal) { Text(tr(Txt.COMMON_OK), color = c.onAction) }
                }
            }
            if (canPropose) proposal?.error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.onAction) }
        }
    }
}

@Composable
private fun AnnouncementCard(a: TodayAnnouncement, onAcknowledge: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr(Txt.TODAY_LATEST_UPDATE), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Spacer(Modifier.weight(1f))
            Text("${a.author} · ${a.publishedAt}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        }
        Spacer(Modifier.height(6.dp))
        Text(a.title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(2.dp))
        Text(a.body, style = MaterialTheme.typography.bodyLarge, color = c.textMuted)
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            when (a.ack) {
                AckState.UNACKNOWLEDGED -> Button(
                    onClick = { onAcknowledge(a.id) },
                    colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                    shape = MaterialTheme.shapes.small,
                ) { Text(tr(Txt.TODAY_ACKNOWLEDGE)) }
                AckState.PENDING -> OutlinedButton(onClick = {}, enabled = false, shape = MaterialTheme.shapes.small) {
                    Icon(AppIcons.Clock, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(tr(Txt.TODAY_QUEUED))
                }
                AckState.ACKNOWLEDGED -> OutlinedButton(onClick = {}, enabled = false, shape = MaterialTheme.shapes.small) {
                    Icon(AppIcons.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(tr(Txt.TODAY_ACKNOWLEDGED))
                }
            }
            Text(trf(Txt.TODAY_ACK_COUNT, a.acknowledgedCount, a.totalCount), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        }
    }
}

/** D13: status, never coordinates. Tone picks the colour; the words come from core. */
@Composable
internal fun GuardianStatusCard(card: GuardianCard) {
    val c = LocalVoysembleColors.current
    val tone = when (card.tone) {
        GuardianTone.GOOD -> c.action
        GuardianTone.ATTENTION -> c.warning
        GuardianTone.CALM -> c.textMuted
    }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr(Txt.TODAY_YOUR_TRAVELER), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Spacer(Modifier.weight(1f))
            Text(listOfNotNull(card.travelerName, card.groupName).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(8.dp))
        Text(card.headline, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = tone)
        Spacer(Modifier.height(4.dp))
        Text(card.detail, style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        card.balance?.let { b ->
            Spacer(Modifier.height(4.dp))
            Text(b, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        }
        card.message?.let { m ->
            Spacer(Modifier.height(8.dp))
            Text(m, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth().background(c.action.copy(alpha = 0.1f), RoundedCornerShape(10.dp)).padding(10.dp))
        }
    }
}

@Composable
internal fun GuardianCareCard(care: GuardianCareState, onEdit: () -> Unit, onCancel: () -> Unit, onSave: (CareNoteDto) -> Unit) {
    val c = LocalVoysembleColors.current
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr(Txt.TODAY_CARE_NOTE), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Spacer(Modifier.weight(1f))
            Text(
                if (care.status.hasCareNote) trf(Txt.TODAY_CARE_ON_FILE, care.status.reveals) else tr(Txt.TODAY_CARE_NOT_ON_FILE),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(6.dp))
        val draft = care.draft
        if (draft == null) {
            Text(
                if (care.status.hasCareNote) tr(Txt.TODAY_CARE_SEALED_INTRO) else tr(Txt.TODAY_CARE_ADD_INTRO),
                style = MaterialTheme.typography.bodyMedium,
                color = c.textMuted,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onEdit, shape = MaterialTheme.shapes.small) { Text(if (care.status.hasCareNote) tr(Txt.TODAY_CARE_EDIT) else tr(Txt.TODAY_CARE_ADD)) }
        } else {
            var allergies by remember(draft) { mutableStateOf(draft.allergies) }
            var medications by remember(draft) { mutableStateOf(draft.medications) }
            var freeText by remember(draft) { mutableStateOf(draft.freeText) }
            OutlinedTextField(value = allergies, onValueChange = { allergies = it.take(200) }, label = { Text(tr(Txt.TODAY_CARE_ALLERGIES)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = medications, onValueChange = { medications = it.take(200) }, label = { Text(tr(Txt.TODAY_CARE_MEDICATIONS)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = freeText, onValueChange = { freeText = it.take(500) }, label = { Text(tr(Txt.TODAY_CARE_FREE_TEXT)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { onSave(CareNoteDto(allergies, medications, freeText)) },
                    enabled = !care.saving,
                    colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                    shape = MaterialTheme.shapes.small,
                ) { Text(if (care.saving) tr(Txt.TODAY_CARE_SAVING) else tr(Txt.TODAY_CARE_SAVE)) }
                OutlinedButton(onClick = onCancel, enabled = !care.saving, shape = MaterialTheme.shapes.small) { Text(tr(Txt.COMMON_CANCEL)) }
            }
        }
        care.message?.let { m ->
            Spacer(Modifier.height(6.dp))
            Text(m, style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        }
    }
}

@Composable
private fun HeadcountCard(groups: List<HeadcountGroup>, checkedIn: Int, expected: Int, onOpenHeadcount: () -> Unit, onOpenIncidents: () -> Unit = {}) {
    val c = LocalVoysembleColors.current
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr(Txt.TODAY_HEAD_COUNT), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Spacer(Modifier.weight(1f))
            Text(trf(Txt.TODAY_CHECKED_IN, checkedIn, expected), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onOpenHeadcount, shape = MaterialTheme.shapes.small) { Text(tr(Txt.TODAY_OPEN_HEAD_COUNT)) }
            OutlinedButton(onClick = onOpenIncidents, shape = MaterialTheme.shapes.small) { Text(tr(Txt.TODAY_INCIDENTS)) }
        }
        Spacer(Modifier.height(10.dp))
        groups.forEach { g ->
            val short = g.checkedIn < g.expected
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(g.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(48.dp))
                LinearProgressIndicator(
                    progress = { if (g.expected == 0) 0f else g.checkedIn.toFloat() / g.expected },
                    modifier = Modifier.weight(1f).height(8.dp),
                    color = if (short) c.warning else c.action,
                    trackColor = c.border,
                )
                Text(
                    text = if (short) trf(Txt.TODAY_GROUP_MISSING, g.checkedIn, g.expected, g.expected - g.checkedIn) else "${g.checkedIn}/${g.expected}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
internal fun EventRow(e: TodayEvent) {
    val c = LocalVoysembleColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(52.dp)) {
            Text(e.start, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            e.end?.let { Text("– $it", style = MaterialTheme.typography.labelSmall, color = c.textMuted) }
        }
        Box(
            modifier = Modifier.size(36.dp).background(c.surfaceRaised, RoundedCornerShape(10.dp)).border(1.dp, c.border, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(iconFor(e.kind), contentDescription = null, tint = c.textMuted, modifier = Modifier.size(18.dp)) }
        Column(Modifier.weight(1f)) {
            Text(e.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            Text(e.place, style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            e.note?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = c.warning) }
        }
        StatusChip(e.status)
    }
}

@Composable
internal fun StatusChip(status: EventStatus) {
    val c = LocalVoysembleColors.current
    val (label, color) = when (status) {
        EventStatus.SCHEDULED -> tr(Txt.STATUS_SCHEDULED) to c.textMuted
        EventStatus.IN_PROGRESS -> tr(Txt.STATUS_NOW) to c.action
        EventStatus.DONE -> tr(Txt.STATUS_DONE) to c.success
        EventStatus.DELAYED -> tr(Txt.STATUS_DELAYED) to c.warning
        EventStatus.CANCELLED -> tr(Txt.STATUS_CANCELLED) to c.danger
    }
    Text(
        label,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier.background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp)).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun Card(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val c = LocalVoysembleColors.current
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, c.border),
        modifier = Modifier.fillMaxWidth(),
    ) { Column(Modifier.padding(16.dp), content = content) }
}

@Composable
internal fun BottomTabs(selected: MainTab, onSelect: (MainTab) -> Unit) {
    val c = LocalVoysembleColors.current
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        TABS.forEach { (tab, label, icon) ->
            NavigationBarItem(
                selected = tab == selected,
                onClick = { onSelect(tab) },
                icon = { Icon(icon, contentDescription = null) },
                label = { Text(tr(label)) },
            )
        }
    }
    // Keep the border token referenced so dark/light both get the hairline from the theme.
    Box(Modifier.height(0.dp).background(c.border))
}

// Keys, not text: the bar reads the language at render (slice 039).
private val TABS: List<Triple<MainTab, Txt, ImageVector>> = listOf(
    Triple(MainTab.TODAY, Txt.TAB_TODAY, AppIcons.Today),
    Triple(MainTab.PLAN, Txt.TAB_PLAN, AppIcons.Plan),
    Triple(MainTab.BULLETIN, Txt.TAB_BULLETIN, AppIcons.Bulletin),
    Triple(MainTab.CHATS, Txt.TAB_CHATS, AppIcons.Chat),
    Triple(MainTab.MEMORIES, Txt.TAB_MEMORIES, AppIcons.Memories),
)

private fun iconFor(kind: EventKind): ImageVector = when (kind) {
    EventKind.FLIGHT -> AppIcons.Plane
    EventKind.BUS -> AppIcons.Bus
    EventKind.MEAL -> AppIcons.Meal
    EventKind.ACTIVITY -> AppIcons.Flag
    EventKind.HOTEL -> AppIcons.Hotel
    EventKind.MEETING -> AppIcons.Pin
    EventKind.FREE -> AppIcons.Today
}

@Composable
private fun CircleDot(color: Color) = Box(Modifier.size(8.dp).background(color, CircleShape))
