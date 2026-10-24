<template><slot /></template>

<style>
:root {
  color-scheme: dark;
  font-family: 'Roboto', system-ui, sans-serif;
  color: #e9eef2;
  background: #101315;
  font-synthesis: none;
  --muted: #9fa9af;
  --border: #30373c;
  --surface: #1a1f22;
  --accent: #a9dfc5;
  --group-grey: #a9b1b9;
  --group-blue: #8ab4f8;
  --group-red: #f28b82;
  --group-yellow: #fdd663;
  --group-green: #81c995;
  --group-pink: #f6aea9;
  --group-purple: #c58af9;
  --group-cyan: #78d9ec;
  --group-orange: #fcad70;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
button,
input,
textarea,
select {
  font: inherit;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: default;
  opacity: 0.4;
}
button,
input,
textarea,
select {
  -webkit-tap-highlight-color: transparent;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1,
h2,
h3 {
  color: #f2f6f5;
}
h2 {
  font-size: 19px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.25px;
}
h3 {
  font-size: 15px;
  font-weight: 600;
}
p {
  color: var(--muted);
}
fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
label,
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #cdd5da;
  margin-bottom: 8px;
}
input[type='text'],
textarea,
select {
  width: 100%;
  border: 1px solid #3b444a;
  border-radius: 7px;
  padding: 10px 12px;
  color: #edf2f5;
  background: #131719;
  outline: none;
  min-width: 0;
}
input[type='text']:focus,
textarea:focus,
select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px #a9dfc513;
}
input::placeholder,
textarea::placeholder {
  color: #737f88;
  opacity: 1;
}
textarea {
  resize: vertical;
  display: block;
  min-height: 75px;
  line-height: 1.6;
}
select {
  font-size: 12px;
  min-height: 43px;
}
code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  padding: 1px 4px;
  border-radius: 3px;
  background: #30383d;
  color: #dce6e9;
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 12px;
}
.optional {
  font-weight: 400;
  color: #8f9ba3;
  font-size: 11px;
  margin-left: 3px;
}
.settings-page {
  max-width: 1220px;
  margin: 0 auto;
  padding: 0 42px 150px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 30px 0;
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  font-size: 16px;
  font-weight: 500;
}
.brand b {
  font-weight: 400;
  color: #91a39a;
  margin-left: 3px;
}
.brand-icon {
  position: relative;
  display: flex;
  align-items: end;
  gap: 3px;
  width: 25px;
  height: 24px;
}
.brand-icon i {
  width: 6px;
  border-radius: 3px;
  background: var(--accent);
  height: 18px;
}
.brand-icon i:nth-child(2) {
  height: 24px;
  opacity: 0.7;
}
.brand-icon i:nth-child(3) {
  height: 14px;
  opacity: 0.45;
}
.version-tag {
  color: #8d999f;
  font-size: 11px;
  letter-spacing: 0.3px;
}
.intro {
  padding: 43px 0 37px;
}
.eyebrow {
  display: block;
  font-size: 10px;
  letter-spacing: 1.9px;
  font-weight: 600;
  color: #9fbaad;
  margin-bottom: 14px;
}
.intro h1 {
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1.12;
  font-weight: 500;
  letter-spacing: -1.6px;
  margin-bottom: 16px;
}
.intro > p {
  font-size: 14px;
}
.behavior-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}
.behavior-chips > span {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #303a34;
  background: #19221d;
  color: #b8c8be;
  padding: 4px 9px;
  border-radius: 5px;
  font-size: 11px;
}
.status-dot,
.group-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.status-dot.inactive {
  background: #8d999f;
}
.group-dot {
  width: 9px;
  height: 9px;
  background: var(--dot-color);
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 306px;
  gap: 26px;
  align-items: start;
}
.rules-section,
.sidebar {
  min-width: 0;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 15px;
  margin: 0 0 20px;
}
.section-heading h2 {
  display: flex;
  align-items: center;
  gap: 9px;
}
.section-heading p {
  font-size: 12px;
  margin-top: 5px;
}
.count {
  color: #aebdb4;
  background: #29362e;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 6px;
  font-weight: 500;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.rule-card {
  margin-bottom: 17px;
  padding: 21px 23px 24px;
  border-top: 2px solid var(--rule-color);
}
.rule-card-heading,
.rule-heading-label,
.rule-actions {
  display: flex;
  align-items: center;
}
.rule-card-heading {
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 21px;
}
.rule-heading-label {
  gap: 9px;
  min-width: 0;
  flex-wrap: wrap;
}
.rule-heading-label h3 {
  overflow-wrap: anywhere;
}
.rule-number {
  color: #7c8a91;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.rule-badge {
  font-size: 10px;
  color: #a6b3b9;
  background: #2a3237;
  border: 1px solid #39434a;
  border-radius: 4px;
  padding: 2px 6px;
}
.rule-actions {
  gap: 4px;
  flex-shrink: 0;
}
.icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid #3b454c;
  color: #bcc8d0;
  border-radius: 5px;
  font-size: 16px;
  line-height: 1;
}
.icon-button:hover:not(:disabled) {
  background: #303b41;
  color: white;
}
.remove-button {
  margin-left: 6px;
  border-color: transparent;
  color: #8b99a2;
}
.remove-button:hover:not(:disabled) {
  color: #ffb4ab;
}
.rule-top-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 22px;
  align-items: start;
  margin-bottom: 19px;
}
.color-palette {
  display: flex;
  gap: 3px;
  height: 43px;
  align-items: center;
}
.color-swatch {
  position: relative;
  width: 21px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0;
}
.color-swatch input {
  position: absolute;
  opacity: 0;
  width: 21px;
  height: 25px;
  margin: 0;
  cursor: pointer;
}
.color-swatch span {
  display: block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--swatch);
  pointer-events: none;
}
.color-swatch input:checked + span {
  outline: 1px solid var(--swatch);
  outline-offset: 3px;
}
.color-swatch input:focus-visible + span {
  outline: 2px solid white;
  outline-offset: 3px;
}
.field-help {
  font-size: 11px;
  line-height: 1.6;
  margin-top: 7px;
  color: #929fa8;
}
.rule-field {
  margin-bottom: 19px;
}
.rule-field textarea {
  font-family: ui-monospace, 'Roboto', monospace;
  font-size: 12px;
}
.rule-secondary-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}
.inline-warning {
  font-size: 11px;
  color: #e3c58c;
  padding: 9px 11px;
  border: 1px solid #5c5035;
  border-radius: 5px;
  background: #332d20;
  margin: -5px 0 18px;
}
.preview-panel {
  padding: 23px;
}
.preview-panel .eyebrow {
  margin-bottom: 11px;
}
.preview-panel h2 {
  font-size: 17px;
  margin-bottom: 6px;
}
.preview-panel > p {
  font-size: 12px;
}
.preview-panel label {
  margin-top: 21px;
}
.preview-panel input {
  font-size: 12px;
}
.preview-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 24px 0 10px;
  background: #1e2b24;
  border: 1px solid #3a5143;
  padding: 16px;
  border-radius: 7px;
  min-height: 105px;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.preview-result strong {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e4f2e9;
  font-size: 19px;
  font-weight: 500;
}
.help-panel {
  padding: 24px 6px;
}
.help-panel h3 {
  font-size: 12px;
  margin-bottom: 10px;
  color: #c6d0d6;
}
.help-panel p {
  font-size: 12px;
  line-height: 1.7;
  margin-bottom: 11px;
  color: #8f9ba3;
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 9px 13px;
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
  min-height: 38px;
}
.button.primary {
  color: #14271d;
  background: var(--accent);
  border-color: var(--accent);
}
.button.primary:hover:not(:disabled) {
  background: #c5f1d9;
}
.button.secondary {
  background: #20272b;
  border-color: #3b454c;
  color: #d0dade;
}
.button.secondary:hover:not(:disabled) {
  background: #2b363d;
}
.text-button {
  border: 0;
  background: transparent;
  color: #a5b7ad;
  font-size: 12px;
  padding: 9px 8px;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.backup-panel {
  padding: 23px;
  margin-top: 17px;
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
}
.backup-panel h2 {
  font-size: 15px;
  margin-bottom: 4px;
}
.backup-panel p {
  font-size: 12px;
}
.backup-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.reset-confirmation {
  width: 100%;
  padding-top: 15px;
  border-top: 1px solid var(--border);
}
.reset-confirmation p {
  margin-bottom: 12px;
}
.save-bar {
  position: fixed;
  z-index: 5;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 18px max(28px, calc((100vw - 1136px) / 2));
  background: #181e21f5;
  border-top: 1px solid #3b444a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  backdrop-filter: blur(14px);
}
.save-bar strong {
  font-size: 12px;
  font-weight: 500;
}
.save-bar p {
  font-size: 11px;
  margin-top: 4px;
}
.save-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}
.message {
  padding: 15px 18px;
  border: 1px solid;
  border-radius: 7px;
  margin-bottom: 20px;
  font-size: 13px;
}
.message.error {
  color: #ffb4ab;
  border-color: #754c47;
  background: #342424;
}
.message.warning {
  border-color: #625c41;
  background: #302d20;
}
.message.warning p {
  color: #e5d2a6;
  margin-bottom: 12px;
}
.loading-state,
.empty-state {
  padding: 30px;
}
.empty-state h3 {
  margin-bottom: 7px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.popup-page {
  width: 388px;
  padding: 22px;
}
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 26px;
}
.popup-header .brand {
  font-size: 14px;
}
.popup-page h1 {
  font-size: 25px;
  font-weight: 500;
  line-height: 1.22;
  letter-spacing: -0.6px;
  margin-bottom: 10px;
}
.popup-intro {
  font-size: 12px;
  margin-bottom: 21px;
}
.popup-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #c2ddcc;
  padding-bottom: 14px;
}
.popup-rules {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: auto;
  max-height: 265px;
  background: var(--surface);
}
.popup-rules li {
  display: flex;
  gap: 11px;
  align-items: start;
  padding: 13px;
}
.popup-rules li + li {
  border-top: 1px solid var(--border);
}
.popup-rules li .group-dot {
  margin-top: 6px;
}
.popup-rules li > div {
  flex: 1;
  min-width: 0;
}
.popup-rules li strong {
  font-size: 12px;
  font-weight: 500;
}
.popup-rules li p {
  font-size: 10px;
  margin-top: 3px;
  word-break: break-word;
}
.popup-rules li > .small {
  font-size: 9px;
  margin-top: 4px;
}
.popup-note {
  font-size: 11px;
  line-height: 1.6;
  margin: 15px 0 20px;
}
.popup-settings-button {
  width: 100%;
  justify-content: space-between;
}
@media (max-width: 980px) {
  .settings-page {
    padding-left: 24px;
    padding-right: 24px;
  }
  .workspace {
    grid-template-columns: minmax(0, 1fr) 270px;
    gap: 18px;
  }
  .rule-top-fields {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .rule-secondary-fields {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 730px) {
  .settings-page {
    padding: 0 17px 185px;
  }
  .page-header {
    padding: 20px 0;
  }
  .intro {
    padding-top: 30px;
  }
  .workspace {
    display: flex;
    flex-direction: column;
  }
  .rules-section,
  .sidebar {
    width: 100%;
  }
  .section-heading {
    flex-wrap: wrap;
  }
  .rule-card {
    padding: 18px;
  }
  .save-bar {
    padding: 13px 17px;
    display: block;
  }
  .save-actions {
    margin-top: 12px;
  }
  .save-actions .button {
    flex: 1;
  }
  .backup-panel {
    padding: 18px;
  }
}
</style>
