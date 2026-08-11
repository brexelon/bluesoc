/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { $i } from '@/i.js';
import { instance } from '@/instance.js';

export const basicTimelineTypes = [
	'home',
	'local',
	'social',
	'bubble',
	'global',
] as const;

export type BasicTimelineType = typeof basicTimelineTypes[number];

export function isBasicTimeline(timeline: string): timeline is BasicTimelineType {
	return basicTimelineTypes.includes(timeline as BasicTimelineType);
}

export function basicTimelineIconClass(timeline: BasicTimelineType): string {
	switch (timeline) {
		case 'home':
			return 'ti ti-home';
		case 'local':
			return 'ti ti-planet';
		case 'social':
			return 'ti ti-universe';
		case 'bubble':
			return 'ph-drop ph-bold ph-lg';
		case 'global':
			return 'ti ti-whirl';
	}
}

export function isAvailableBasicTimeline(timeline: BasicTimelineType | undefined | null): boolean {
	switch (timeline) {
		case 'home':
			return $i != null;
		case 'local':
			return ($i == null && instance.policies.ltlAvailable) || ($i != null && $i.policies.ltlAvailable);
		case 'social':
			// Deliberately not gated on federation: unlike global and bubble, the
			// social timeline is followees + local public notes + your own, so with
			// federation off it still has local content to show.
			return $i != null && $i.policies.ltlAvailable;
		case 'bubble':
			// The bubble timeline selects only remote notes (userHost IS NOT NULL)
			// from bubbled instances, so with federation off it has nothing to draw
			// on but frozen history, if any.
			if (instance.federation === 'none') return false;
			return ($i == null && instance.policies.btlAvailable) || ($i != null && $i.policies.btlAvailable);
		case 'global':
			// The global timeline is every public note with no host filter, so with
			// federation off it degenerates into a duplicate of the local timeline.
			if (instance.federation === 'none') return false;
			return ($i == null && instance.policies.gtlAvailable) || ($i != null && $i.policies.gtlAvailable);
		default:
			return false;
	}
}

export function availableBasicTimelines(): BasicTimelineType[] {
	return basicTimelineTypes.filter(isAvailableBasicTimeline);
}

export function hasWithReplies(timeline: BasicTimelineType | undefined | null): boolean {
	return timeline === 'local' || timeline === 'social';
}
