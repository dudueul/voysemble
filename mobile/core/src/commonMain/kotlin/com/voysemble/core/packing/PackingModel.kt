// Copyright 2026- At Day. All rights reserved.
//
// Packing checklist on the phone (D38, slice 048): the organizer's items as one list to tick,
// shared by Android and iOS. Pure Kotlin: the wire list becomes `PackingList`, a tick flips one
// item locally before the server confirms, the summary line counts, and a guardian's list says
// whose it is. Functions rather than properties where Swift must see members.

package com.voysemble.core.packing

import com.voysemble.core.api.MyPackingListDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf

public data class PackingItem(
    val id: String,
    val name: String,
    val note: String,
    val packed: Boolean,
    /** ISO instant of the tick; null while unpacked. */
    val packedAt: String?,
)

public data class PackingList(
    val items: List<PackingItem>,
    /** The traveler whose list this is (the reader, or a guardian's traveler). */
    val travelerName: String,
    /** True when a guardian packs for their traveler. */
    val forTraveler: Boolean,
    val offline: Boolean = false,
)

public fun packingOf(dto: MyPackingListDto): PackingList = PackingList(
    items = dto.items.map { PackingItem(it.id, it.name, it.note, it.packed, it.packedAt) },
    travelerName = dto.travelerName,
    forTraveler = dto.packingFor == "guardian",
)

public fun emptyPackingList(): PackingList = PackingList(emptyList(), "", forTraveler = false)

public fun PackingList.withOffline(offline: Boolean): PackingList = copy(offline = offline)

/** The same list with one item flipped (the optimistic tick; the server's answer replaces it). */
public fun PackingList.withPacked(itemId: String, packed: Boolean, at: String?): PackingList =
    copy(items = items.map { if (it.id == itemId) it.copy(packed = packed, packedAt = if (packed) at else null) else it })

public fun PackingList.replaceItem(item: PackingItem): PackingList =
    copy(items = items.map { if (it.id == item.id) item else it })

public fun PackingList.packedCount(): Int = items.count { it.packed }

public fun PackingList.allPacked(): Boolean = items.isNotEmpty() && items.all { it.packed }

/** "6 of 9 packed", "All 9 packed" or "No items yet". */
public fun PackingList.summary(): String = when {
    items.isEmpty() -> tr(Txt.PACK_NONE)
    allPacked() -> trf(Txt.PACK_ALL, items.size)
    else -> trf(Txt.PACK_PROGRESS, packedCount(), items.size)
}

/** "Packing for Minji Park" for a guardian, "Your packing list" otherwise. */
public fun PackingList.whose(): String =
    if (forTraveler) trf(Txt.PACK_FOR, travelerName) else tr(Txt.PACK_YOURS)
