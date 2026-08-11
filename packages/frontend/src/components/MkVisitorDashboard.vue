<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="instance" :class="$style.root">
	<div :class="[$style.main, $style.panel]">
		<button class="_button _acrylic" :class="$style.mainMenu" @click="showMenu"><i class="ti ti-dots"></i></button>
		<div :class="$style.mainFg">
			<h1 :class="$style.mainTitle">
				<img v-if="logoUrl" :src="logoUrl" :alt="instanceName" :class="$style.mainLogo"/>
				<span v-else>{{ instanceName }}</span>
			</h1>
			<div :class="$style.mainAbout">
				<!-- eslint-disable-next-line vue/no-v-html -->
				<div v-html="sanitizeHtml(instance.description) || i18n.ts.headlineMisskey"></div>
			</div>
			<div v-if="instance.disableRegistration || instance.federation !== 'all'" :class="$style.mainWarn" class="_gaps_s">
				<MkInfo v-if="instance.disableRegistration" warn>{{ i18n.ts.invitationRequiredToRegister }}</MkInfo>
				<MkInfo v-if="instance.federation === 'specified'" warn>{{ i18n.ts.federationSpecified }}</MkInfo>
				<MkInfo v-else-if="instance.federation === 'none'" warn>{{ i18n.ts.federationDisabled }}</MkInfo>
			</div>
			<div v-if="instance.approvalRequiredForSignup" :class="$style.mainWarn">
				<MkInfo warn>{{ i18n.ts.approvalRequiredToRegister }}</MkInfo>
			</div>
			<div class="_gaps_s" :class="$style.mainActions">
				<MkButton :class="$style.mainAction" full rounded gradate data-cy-signup style="margin-right: 12px;" @click="signup()">{{ i18n.ts.joinThisServer }}</MkButton>
				<MkButton v-if="instance.policies.ltlAvailable" :class="$style.mainAction" full rounded link to="/explore">{{ i18n.ts.explore }}</MkButton>
				<MkButton :class="$style.mainAction" full rounded data-cy-signin @click="signin()">{{ i18n.ts.login }}</MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import sanitizeHtml from '@/utility/sanitize-html.js';
import XSigninDialog from '@/components/MkSigninDialog.vue';
import XSignupDialog from '@/components/MkSignupDialog.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { instanceName } from '@@/js/config.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { openInstanceMenu } from '@/ui/_common_/common.js';

// Falls back to the instance name as text when no logo is configured, so an
// instance without artwork doesn't render a broken image where its title was.
const logoUrl = computed(() => instance.sidebarLogoUrl ?? instance.iconUrl ?? null);

function signin() {
	const { dispose } = os.popup(XSigninDialog, {
		autoSet: true,
	}, {
		closed: () => dispose(),
	});
}

function signup() {
	const { dispose } = os.popup(XSignupDialog, {
		autoSet: true,
	}, {
		closed: () => dispose(),
	});
}

function showMenu(ev: MouseEvent) {
	openInstanceMenu(ev);
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.panel {
	position: relative;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	box-shadow: 0 12px 32px rgb(0 0 0 / 25%);
}

.main {
	text-align: center;
}

.mainMenu {
	position: absolute;
	top: 16px;
	right: 16px;
	width: 32px;
	height: 32px;
	border-radius: var(--MI-radius-sm);
	font-size: 18px;
	z-index: 50;
}

.mainFg {
	position: relative;
	z-index: 1;
}

.mainTitle {
	display: block;
	margin: 0;
	// The instance icon used to overhang the top of the panel; now that the logo
	// sits inside the title, the panel needs its own top padding instead.
	padding: 32px 32px 24px 32px;
	font-size: 1.4em;

	// On a narrow card a full-width logo would reach under the menu button
	// overlaid at the top right, so drop it below the button instead.
	@media (max-width: 500px) {
		padding-top: 56px;
	}
}

.mainLogo {
	display: block;
	margin: 0 auto;
	vertical-align: bottom;
	max-height: 120px;
	max-width: min(100%, 300px);
}

.mainAbout {
	padding: 0 32px;
}

.mainWarn {
	padding: 32px 32px 0 32px;
}

.mainActions {
	padding: 32px;
}

.mainAction {
	line-height: 28px;
}
</style>
