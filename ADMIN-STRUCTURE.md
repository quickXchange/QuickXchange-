# Current Admin Panel Structure and Workflows

## Purpose and scope

This document describes the current Admin Panel's information architecture and interaction workflows. It is a reusable functional reference, not a proposed redesign.

It covers navigation, page organization, viewing records, row interactions, editing, selection, bulk actions, drawers, dialogs, confirmations, permissions, and mobile behavior.

**Excluded:** visual design, colors, CSS, implementation components, branding assets or values, source-code exports, backend implementation, credentials, connection values, live customer data, and live financial records.

The reference was extracted from the current frontend navigation, page handlers, forms, and dialog behavior. No live records or administrative mutations were needed. A described control is a frontend workflow, not an independent attestation of its backend behavior or an assertion that every operator can use it.

## Contents

1. Navigation and access
2. Shared interaction patterns
3. Overview
4. Orders
5. Shared currency and payment catalog
6. Crypto Assets
7. Crypto Networks
8. Payment Methods and fiat attachments
9. Routes
10. Pricing and fees
11. Providers and API integrations
12. Customers / Users
13. Website settings and content
14. Staff and permissions
15. Activity and audit
16. Other current Admin sections
17. Dialog and confirmation inventory
18. Selection scope reference
19. Mobile behavior

---

## 1. Navigation and access

### Current sidebar order

The following is the full navigation before permission filtering. Labels below are the current English navigation labels.

| Group | Items, in order |
| --- | --- |
| Workspace | Overview |
| Operations | Orders; Revenue; Users |
| Affiliates | Affiliates; Payouts; Program Settings |
| Telegram | Support Bot |
| Configuration | Appearance; Providers & API Integrations; Background Studio; Notification Settings; Currencies & Payment Methods; Manual Pricing; Swap Order Add-ons; BestChange XML; Staff; Site content; Blog; Newsletter Subscribers |

### Navigation hierarchy

- **Crypto Assets**, **Crypto Networks**, **Payment Methods**, and **Fiat Currencies** are tabs within **Currencies & Payment Methods**, not independent sidebar entries.
- **Pricing & Fees** is represented by **Manual Pricing** and **Swap Order Add-ons**.
- **Customers** is labeled **Users** in the sidebar.
- **Website Settings** is distributed across Appearance, Background Studio, Notification Settings, and Site content, with Blog and Newsletter Subscribers as related publishing tools.
- **Staff** contains Members, Roles, and Activity tabs.
- **Routes** is not a standalone sidebar page.
- There is no standalone, global **Audit** sidebar page.

### Access and permission filtering

- Navigation shows only sections the operator is permitted to view; empty groups disappear.
- Pages with multiple relevant view permissions can be entered through an allowed area. This does not grant every tab or every mutation.
- Viewing and managing are distinct capabilities. Add, Edit, Delete, financial status actions, and sensitive connection actions are separately restricted.
- Support Bot, Notification Settings, and BestChange XML are Owner-only navigation entries.
- Staff administration and sensitive provider configuration have additional Owner-only controls.
- Signing in alone does not establish Admin access. The shell checks operator authorization and security requirements.
- Access can require authenticator enrollment or an authenticator challenge. Loading, unavailable authorization, and restricted access are distinct states.
- Restricted pages provide a return link to an available destination rather than granting access through the URL.

### Header navigation

The shared header exposes language selection, an account/profile menu, sign-out, and page actions where supplied. The notification shortcut currently goes to Overview; it is not a separate notification-center screen.

## 2. Shared interaction patterns

### Lists and detail screens

- Financial order rows open an order detail drawer.
- Customer directory rows open a dedicated customer profile page.
- Catalog rows are not uniformly clickable. Their explicit Edit controls and action menus open editors.
- Checkboxes select records; selecting a record is not the same as opening it.
- Nested actions are kept separate from row-opening behavior.
- Filters narrow the list. Pagination changes the displayed subset. **Select All has a different scope on different pages**; see section 18.
- An empty result, initial loading, failed loading, and an in-flight save are separate states.

### Editing

- Add opens a blank editor; Edit loads the existing record.
- Editors use explicit Save/Create/Apply actions. Changing a draft control is not necessarily a saved change.
- Pending mutations disable relevant submission controls.
- Bulk editors commonly require choosing which settings to apply. Unchecked settings are not intended to be replaced.
- Some editors support reviewed changes followed by a separate confirmation; others save directly.
- Unsaved-change protection is **not universal**. The order drawer and public-page editor explicitly implement discard protection. It should not be assumed for every catalog or settings editor.

### Feedback

Admin mutations generally report success or failure through timed action feedback. Validation errors and review instructions can remain beside the relevant controls. Batch operations may report partial success rather than pretending every target changed.

### Confirmations

The current UI uses both dedicated confirmation dialogs and browser confirmation prompts. It does not put a confirmation in front of every mutation. The inventory in section 17 distinguishes destructive confirmations, reviewed configuration changes, direct saves, and direct actions.

## 3. Overview

### Viewing

Overview is the operational landing page.

- Product control switches between Swap and Convert.
- Date controls choose reporting periods; custom ranges expose start and end date fields.
- Eight headline metrics cover total orders, pending orders, completed orders, failed/cancelled orders, total volume, total profit, registered users, and average order value.
- Profit is based on the available audited Swap report. Convert profit is explicitly not tracked rather than represented as equivalent audited revenue.
- Historical charts, status breakdowns, currency rankings, and recent activity supplement the metrics.
- Needs Attention and Recent Orders show compact order subsets, with up to six orders in each.
- Full-queue and view-all links open the Orders directory with relevant context.
- Operational monitoring sections expose provider/reconciliation and deposit-monitoring state.

### Actions

- Quick actions lead to Manual Pricing or open creation flows for currencies, payment methods, and crypto assets.
- Order links lead into Orders and the selected order's detail flow.
- Monitoring configuration opens its dedicated editor where authorized.
- Refresh/retry controls reload the associated operational information.

### Selection and editing

Overview is not a bulk-selection screen. Metrics and charts are read-only reporting controls, not inline-editable records. Configuration actions open the existing specialized tools.

## 4. Orders

### Directory organization

- Swap and Convert are separate product views.
- Active and archived views separate ordinary operational records from archived records.
- Search and filters narrow the directory. The available controls include status, provider state, source/destination asset and network, sending/receiving settlement method, customer email, amount range, and date-related criteria.
- Filter reset clears the active criteria.
- Page size options are 10, 20, 50, and 100.
- Export is a dedicated action with its own pending/error state; it is not a bulk status action.

### Row behavior

- Clicking an order row opens its detail drawer.
- The selected order is represented in the order-detail URL while list context is retained.
- Closing returns to the directory and preserves the query context.
- Checkboxes and row action controls are distinct from opening the row.

### Selection and bulk actions

- The header checkbox selects the orders displayed on the current page.
- Bulk actions use selected rows in the current operational view, not every filtered order in the database.
- Swap bulk status actions offer only statuses valid for all selected targets and permitted for the operator.
- Payment confirmation, completion, cancellation, and other status changes have distinct permission checks.
- Convert status is provider-synchronized; the directory does not offer the same manual lifecycle override as Swap.
- Archive, restore, and permanent-delete flows use confirmation dialogs from the directory.
- Permanent deletion is distinct from archive. Restoring an archive returns it to the ordinary directory.

### Order detail drawer organization

The drawer organizes the selected order into operational information and action areas:

1. Order identity, product, current status, timestamps, customer context, and assignment.
2. Sending and receiving amounts, assets/networks, settlement methods, and saved payment information.
3. Customer payment instructions and additional payment details where applicable.
4. Deposit/payment proof and transaction information where available.
5. Operational references, internal notes, and relevant editing controls.
6. Provider support information and reconciliation attempts/tools for provider-backed orders.
7. Archive/restore actions and a completed-order invoice action where available.
8. Copy actions for supported identifiers and payment information.

### Editing and confirmations

- Assignment and permitted operational fields have explicit save/update actions.
- Swap status controls are permission- and transition-dependent.
- Convert exposes provider state and reconciliation tools rather than a parallel manually editable status lifecycle.
- Information presented from an order snapshot is distinct from editable operational references.
- Clearing saved payment details has an explicit confirmation.
- Closing a dirty order drawer asks whether to discard unsaved changes.
- Directory archive/restore confirmation should not be generalized to every entry point: the drawer's archive/restore handler invokes the change directly.
- Completed-order invoice generation is an output action, not an order-state mutation.

## 5. Shared currency and payment catalog

### Tab order

Within **Currencies & Payment Methods**, the tabs are:

1. Fiat Currencies
2. Payment Methods
3. Crypto Assets
4. Crypto Networks

### Common organization

- Each tab has its own searchable/filterable table and pagination.
- The Add action changes with the active tab: Add Currency, Add Method, Add Asset, or Add Network.
- Permissions determine which tabs and mutations are available.
- Records have explicit edit/action controls. A plain catalog row is not itself a general-purpose detail-opening target.
- Enabled/disabled state is distinct from more specific direction or deposit settings.
- Selection exposes a bulk-action toolbar.

### Fiat Currencies

- View currency identity and enabled state, with associated payment-method information.
- Add/Edit opens the currency editor.
- Currency settings include identity and operational configuration; appearance assets themselves are outside this reference.
- The currency's payment-method attachment area manages which rails are usable for that currency.
- Select All targets the current page.
- Selection clears on page/filter changes.
- Enable/Disable/Delete act on the selected current-page currencies; deletion requires confirmation.

## 6. Crypto Assets

### Viewing and row behavior

- View each asset's identity, enabled state, and associated networks.
- Search/filter and page through assets.
- Use Edit or the row menu to open the asset drawer.
- Clicking an asset's network chip opens that exact network's editor; it does not open a generic asset-wide network template.

### Single-record editor

- Add creates an asset with its own identity.
- Edit opens the existing identity and asset settings.
- Editable functional fields include code, name, decimal precision, and enabled state.
- Existing immutable identifier fields are not editable as though the record were new.
- Save/Create submits the editor; Delete uses a confirmation.
- Asset editing does not imply that independently configured child-network deposit settings should be replaced.

### Selection and bulk editing

- Header Select All selects the displayed page.
- Filter and page changes clear selection.
- Bulk Enable/Disable/Delete operate on the selected current-page assets.
- Bulk Edit opens a dedicated editor where the operator chooses the settings to apply.
- Child-network settings are an explicit part of the bulk workflow, not an automatic consequence of changing the asset's enabled flag.
- Review precedes the final apply action for the reviewed bulk configuration.
- Deposit-provider assignment remains a separate specialized workflow.

### Provider catalog synchronization

An Owner-only synchronization action opens an import/synchronization dialog. The workflow presents provider catalog information and a result summary. This is a catalog operation, not automatic permission to accept deposits on every imported network.

## 7. Crypto Networks

### Viewing and row behavior

- Each row represents an exact asset-network combination.
- Search/filter and paginate the network list.
- Use Edit or its action menu to open the network drawer.
- An asset-page network chip reaches the same exact-network editing context.
- Adding a network requires choosing its parent asset.

### Network drawer organization

Functional areas include:

- Immutable identity, parent asset, network code/name, and decimal precision.
- Enabled state.
- Memo/tag requirement.
- Required confirmations and confirmation guidance.
- Explorer-link template.
- Deposit instructions and warnings.
- Receiving address and memo/tag.
- Deposit-provider selection.
- Provider asset/network mapping and verification information.
- Manual-wallet tracking and monitoring-related settings.
- Explicit manual fallback configuration where supported.
- A separate **Enable Customer Deposits** setting.

### Important workflow boundaries

- An enabled network is not necessarily enabled for customer deposits.
- Manual receiving-wallet setup and provider-backed deposit setup are different paths.
- Provider mapping is for the exact asset/network route.
- Switching an active Manual route to WhiteBIT requires explicit acknowledgement/confirmation.
- That provider switch does not silently keep customer deposits enabled. Verification and deposit activation are separate steps.
- A saved fallback address is not implicit consent to use fallback funding.
- Connection tests and permission verification have independent pending/results states.
- Delete is a confirmed destructive action.

### Bulk workflows

- Header Select All selects the current page; page/filter changes clear selection.
- Enable/Disable/Delete apply to selected current-page networks.
- Bulk network settings are chosen explicitly rather than copying a whole arbitrary record.
- **Set Wallet Address** collects a receiving address and optional memo/tag, with customer-deposit activation as an explicit option.
- Wallet setup uses preview/review, Back, confirmation/apply, and a result/Done stage.
- Address-sharing targets are presented as an exact network-related scope, not all assets indiscriminately.
- **Assign Deposit Provider** is a separate selection/review/confirm drawer.
- Provider assignment reviews supported exact routes; unsupported targets or targets that still have customer deposits enabled block the apply action.
- Blockchain monitor configuration is a separate editor for monitoring/network/asset configuration. It is not the network's ordinary identity editor.

## 8. Payment Methods and fiat attachments

### Directory

- View method identity, availability/directions, fields, and related currency usage.
- Filter/search and paginate the methods.
- Open Add Method, Edit, or the explicit action menu; a plain row does not automatically open the drawer.

### Payment Method drawer

The method editor organizes:

- Identifier and name.
- Description and instructions.
- Enabled, Can Send, and Can Receive settings.
- Method family and execution mode.
- Provider association/configuration requirement.
- Lifecycle and geographic applicability.
- Directional payment-field definitions.
- Attached-currency reserve configuration where applicable.

### Payment-field editor

- Add a field through a preset or a custom-field flow.
- Edit its label, type, send/receive applicability, and supported field configuration.
- Reorder fields with explicit movement controls.
- Remove a draft field through its remove action.
- Existing saved field identities and hidden configuration are preserved unless the workflow explicitly changes them.
- Method Save/Create persists the edited definitions.
- Customer instruction fields are distinct from operator-facing configuration.

### Currency attachment workflow

A currency's payment-method attachment area supports:

1. Attach a method to the currency.
2. Edit that attachment's enabled, Can Send, and Can Receive settings.
3. Set currency-specific minimum/maximum amounts and countries.
4. Override send/receive instructions.
5. Edit the currency-specific reserve.
6. Save the changed attachment, or detach it.

Reserve is informational payout capacity. It is not a live order balance. The attachment UI explains that zero reserve prevents BestChange advertising that receiving method and orders do not change the reserve.

**Current confirmation behavior:** Detach invokes the action directly; there is no extra confirmation in that attachment handler.

### Selection: the important exception

Payment Methods has persistent selection across pages:

- Page Select All selects/deselects methods on the displayed page.
- Separate **Select all filtered**, **Deselect filtered**, and **Deselect all** controls manage the broader selection.
- A selected count can include records not visible on the current page.
- **Generic Enable/Disable/Delete still use selected methods on the current page.**
- **Bulk Fields**, **Delete Fields**, and **Reserve** use the full persisted selection.
- Field operations support up to 100 selected methods.
- Reserve operations support up to 1,000 selected methods.

### Bulk Fields

1. Start with the full selected-method set.
2. Add/edit/reorder the field definitions to apply.
3. Match/update existing fields and add new fields; unselected fields are not removed.
4. Treat changing an existing field's direction as an explicit choice.
5. Request a review.
6. Review affected methods and proposed changes.
7. Acknowledge and apply.

Changing the selection or field draft invalidates the previous review; the operator must review the revised proposal.

### Delete Fields

1. Gather saved field identities from selected methods.
2. Choose which fields to remove.
3. Review affected methods and removal counts.
4. Explicitly confirm and apply.

This deletes chosen definitions across selected methods; it is not deletion of the payment methods themselves.

### Reserve

The bulk Reserve dialog applies reserve changes to the full selected-method set and the relevant currency attachments. It is separate from both the ordinary enabled-state controls and field-definition editing.

## 9. Routes

### Current placement

There is **no standalone Routes directory, route detail drawer, route checkbox table, or global route bulk toolbar** in the current sidebar structure.

Route administration is distributed:

| Route concern | Current tool |
| --- | --- |
| Fiat currency plus payment method, direction, limits, geography, instructions | Currency payment-method attachments |
| Exact crypto asset/network identity and customer-deposit setup | Crypto Networks |
| Manual versus provider-backed receiving setup | Network drawer and Assign Deposit Provider |
| Provider connection readiness and exact-route verification | Providers & API Integrations |
| Sending/receiving option pairing and pricing | Manual Pricing |
| Publicly advertised export directions | BestChange XML |

### Typical route workflow

1. Configure the source and destination catalog identities.
2. Enable the relevant settlement directions.
3. Configure currency-method attachments or exact crypto-network receiving setup.
4. Complete required provider/monitoring setup separately.
5. Enable customer deposits only through the explicit supported control.
6. Create/edit a pricing rule for the desired source and target scope.
7. Use route/pricing preview tools where offered.

Do not confuse catalog visibility, configured direction, pricing existence, provider assignment, and verified deposit readiness. They are separate settings and workflows.

### Selection and bulk actions

There is no independent route Select All. Selection belongs to the containing catalog, provider-assignment drawer, pricing list, or export-direction editor.

## 10. Pricing and fees

### Manual Pricing directory

- View rules by source/target settlement scope and associated pricing terms.
- Search/filter and paginate the list.
- Open a rule through its explicit edit/view action.
- Add Rule opens the pricing-rule editor.
- Legacy read-only rules use a view-only editor.
- Preview tools inspect pricing for a concrete route without creating a customer order.

### Selection

- Select All selects the **filtered rule set across pages**, not just the visible page.
- Bulk actions include Enable, Disable, Edit, and Delete.
- Read-only legacy rules cannot be treated as ordinary editable targets.
- Single deletion has confirmation; bulk deletion opens a dedicated count/list confirmation modal.

### Single-rule editor

The editor includes:

- Rule name.
- Source and target settlement-option selectors.
- Any/wildcard scope and asset-all-networks scope where supported.
- Enabled state.
- Percentage and adjustment direction.
- Optional exact rate.
- Optional fixed fee.
- Minimum/maximum quantity.
- Operator instructions.
- Customer instructions.
- Amount-based pricing ranges.

Selectors support searching currencies/payment methods and route identities. Selecting a broad scope is different from selecting one exact settlement option.

### Path versus range mode

For a single route, the editor exposes two mutually exclusive editing views:

- **Adding Range:** amount ranges supply the active percentage and fee configuration.
- **Edit Path:** path-level markup, fee, and quantity limits are active; saved ranges are inactive until the range mode is selected and saved.

Switching the editor view is not a delete action against saved pricing data.

Existing mixed-pricing rules have an additional choice to activate range-only pricing. The UI explains whether path charges/limits continue outside saved ranges. Exact-rate configuration remains a separate concern.

### Amount-range editor

- Add Range opens a range-edit dialog.
- Existing ranges offer Edit and Delete actions.
- Inputs cover minimum amount, maximum amount, No Limit, fixed fee, percentage, and direction.
- Direction distinguishes Markup from Give More/customer benefit.
- Save adds/updates the draft range; Cancel closes without that range save.
- Deleting a range removes it from the editor draft; it is not the same as deleting the whole pricing rule.
- The containing rule must still be saved to persist the resulting configuration.

### Multi-rule creation

- New rules can use Single or Multiple source/target selection.
- Multiple source/target choices produce a set of pricing rules.
- Before creation, a confirmation states the number of rules being created.
- Existing-rule editing does not become multi-create merely because its selector changes.

### Bulk Edit

- Choose which fields to apply with per-setting checkboxes.
- Supported groups include source/target scope, percentage/direction, exact rate, fixed fee, amount limits, amount-based pricing, and operator/customer instructions.
- For clearable settings, an explicitly applied blank value can mean clear; an unchecked setting means leave unchanged.
- Apply Changes submits the patch to selected editable rules.
- This is an explicit apply workflow, not the same dedicated deletion confirmation.

### Swap Order Add-ons

This separate page manages optional order add-ons:

- View the add-on list.
- Add/Edit opens an in-page editor that can be collapsed.
- Edit name/key, description, applicability, fee configuration, and enabled state.
- Toggle individual add-ons.
- Save the add-on explicitly.
- Delete asks for confirmation and explains that historical orders retain their saved fees.
- There is no shared pricing-rule Select All on this page.

## 11. Providers and API integrations

### Page organization

The current provider page separates Quickex, WhiteBIT, and Manual Address information.

- View connection/configuration status and health information.
- Refresh integration state.
- Run authorized connection tests.
- Open restricted connection-configuration dialogs where permitted.
- Sensitive connection configuration/testing is Owner-only; viewing provider information does not expose an editable credential export.

### Quickex workflow

- View connection and provider health.
- Open the restricted configuration flow.
- Pass its local confirmation/unlock step.
- Submit the connection update through the configuration dialog.
- Run a connection test separately.
- Close/Cancel exits the configuration flow.

No connection values are reproduced in this reference.

### WhiteBIT workflow

- View configuration status, provider availability, and deposit-permission readiness.
- Open its configuration dialog where authorized.
- Select an exact asset/network for permission verification.
- Acknowledge the verification requirement.
- Confirm the address-permission verification action.
- Run connection tests separately from exact-route address verification.
- Enable/disable the provider through its dedicated control; enablement is subject to readiness.
- Route permission verification is not a bulk grant to all catalog networks.

### Manual Address

Manual Address is represented as a receiving setup that depends on the configured asset-network wallet, rather than as another universal exchange-provider connection form.

### Selection

The provider connection page has no shared row-selection table or page-wide Select All. Exact-route selection and provider assignment are specialized controls with their own review scope.

## 12. Customers / Users

### Directory

- **Users** is the customer directory.
- Search by customer name or email.
- View customer identity/account status and order-related summary information.
- Open a customer row to navigate to the dedicated profile page rather than an order-style side drawer.
- The table includes customer, orders, volume, last activity, and status.
- The current directory has no selection checkboxes, Select All, bulk-action toolbar, or pagination controls. Its footer reports the returned record total.
- On mobile, dedicated customer cards provide the same profile-opening action.

### Profile organization

The profile has **Details** and **Referred Users** tabs.

Details includes:

- Personal/account information and email state.
- Affiliate-account context where available.
- Sending/receiving volume summaries.
- Account-management and danger-zone actions.

Referred Users has its own paginated referral list. Referral rows do not inherit the main Users directory's bulk selection.

### Account-management dialogs

- Edit Customer opens a dedicated editor for first/last name, country, customer role, and applicable referral settings.
- Mark Email Confirmed is a distinct account action with result feedback, not a separate email-edit dialog.
- Reset Password opens a dedicated form with password and confirmation inputs.
- Suspend uses a confirmation dialog.
- Reactivate is an available action for suspended accounts.
- Revoke All Active Sessions has a confirmation dialog and can report that session revocation is unsupported.
- The current profile does not expose a Delete Customer dialog.

These are permission-dependent actions, not ordinary editable cells. Their presence in the frontend does not mean an operator may bypass identity-provider verification requirements.

### Navigation and selection

- Back to Users returns to the customer directory.
- Customer profile tabs are views, not selected customer batches.
- Order-related links lead to the order workflow rather than creating another customer-specific order lifecycle.

## 13. Website settings and content

Website settings are split across dedicated pages. This section preserves their workflow organization without exporting visual settings or branding.

### Appearance

- A dedicated settings editor manages site identity/display configuration.
- It has an explicit draft/save workflow and preview areas.
- Upload/replace/remove operations belong to that editor.
- There is no record table, row click, Select All, or bulk-operation toolbar.
- Visual values, asset content, and design controls are intentionally not enumerated here.

### Background Studio

- Open the current background configuration.
- Prepare a draft, with device-specific preview contexts.
- Preview desktop and mobile independently.
- Reset/revert draft changes or publish the prepared configuration.
- Publication and existing published-version information are separate from the local preview.
- There is no bulk selection.
- Visual parameters and media are intentionally excluded.

### Notification Settings

- Owner-only configuration page.
- Separate delivery channels from individual event preferences.
- Configure customer/operator event delivery and applicable financial milestones.
- Use delivery readiness/testing controls where available.
- Save explicitly; remembered channel switches and effective event activation are distinct.
- It is a settings workflow, not a notifications inbox or bulk message-recipient selection screen.

### Site content workspace

Site content groups public-page drafts and other published-site configuration.

- Choose an editable public page or Widget Exchange Information.
- Edit the selected page's structured draft.
- Page fields include content sections and, where applicable, SEO/navigation settings.
- Header/footer inclusion is a page navigation setting, not creation of an Admin sidebar entry.
- Live preview is read-only and separate from saving/publishing.
- Changing the selected page with unsaved page edits asks whether to discard them.
- Save draft and publish site snapshot are distinct operations.
- Snapshot publication is Owner-only.

Related editor areas include:

- Navigation links.
- Partner-entry management.
- Footer/contact settings and operator-contact routing.
- Social/trust entry management.

These are specialized draft/configuration areas, not a single generic website-record table. Entry creation, editing, enabled state, and removal belong to their local editors; there is no universal Site content Select All.

### Publication boundary

A saved draft is not necessarily the current public site. The snapshot publication control publishes the saved configuration. A local live preview is not itself publication and must not be described as having sent emails, created orders, or applied financial settings.

## 14. Staff and permissions

### Page organization

Staff contains permission-filtered **Members**, **Roles**, and **Activity** tabs. Role management and sensitive member-management controls are Owner-only.

### Members

- View members, membership status, assigned role, and allow/deny override counts.
- Plain member rows are not general detail-page links.
- The action menu exposes applicable actions such as Edit Role & Permissions, approval, suspension, reactivation, and removal.
- Invite Team Member opens an invitation dialog.
- Editing role/permissions opens a dedicated member-permissions dialog.

### Member selection and bulk actions

- Select All selects eligible members on the current page.
- The Owner, the current member, and removed members are excluded from selectable targets.
- Page/page-size changes clear selection.
- Page-size choices are 15, 25, 50, and 100.
- Bulk Enable approves invited members or reactivates suspended members as appropriate.
- Bulk Disable targets active members.
- Bulk Delete/Remove asks for confirmation.
- Bulk Assign Role opens a role dialog and applies the chosen role to selected eligible members.
- Bulk role assignment clears member-specific allow/deny overrides as part of that workflow.
- Batch feedback can distinguish successful and failed targets.

### Roles

- View role name/description, granted-permission count, member usage, and actions.
- Create Role and Edit Role open the same type of dedicated form.
- The form groups permission choices by section.
- Owner-only permission entries are marked as such rather than offered as ordinary grantable checkboxes.
- Header Select All selects roles on the current page; changing page/page size clears selection.
- The selected toolbar permits Edit only when exactly one role is selected.
- Single and bulk role deletion ask for confirmation.
- Roles assigned to members cannot be deleted through the enabled delete flow.

### Member permission editor

- Choose a reusable role.
- Add explicit allow/deny overrides where supported.
- Owner-only permissions are not delegated by these overrides.
- Save explicitly or Cancel.
- A member's effective permissions affect both visible navigation and available actions.

## 15. Activity and audit

### Staff Activity

- Located under **Staff → Activity**, not an independent global Audit menu.
- Read-only event table.
- View actor, action, affected entity/safe label, and exact occurrence time.
- Load failure and no-activity states are explicit.
- Rows do not expose an event-edit drawer.
- There are no selection checkboxes, Select All, edit, or delete controls in this view.

### Other audit-oriented views

- Order details expose reconciliation attempts, support information, and payment/evidence context where applicable.
- Revenue provides audited financial reporting.
- Affiliate details expose an immutable commission ledger.
- Provider and monitoring views expose operational status/results.

These are scoped operational views. The UI does not combine them into a single editable audit-record directory.

## 16. Other current Admin sections

### Revenue

- Read-only financial report with date/period controls, summaries, and report rows.
- Reporting filters do not select records for mutation.
- No order-status editing or shared bulk-selection toolbar belongs to this report.
- An unavailable audited figure is distinct from a confirmed zero.

### Affiliates

- Directory with search/filtering, pagination, row selection, and applicable individual/bulk account actions.
- Account detail navigation exposes affiliate totals and an immutable ledger.
- Page Select All targets the displayed accounts.
- Invitations have their own workflow.
- Affiliate editing/status actions do not make ledger entries editable.

### Payouts

- Directory separates payout requests and statuses.
- Explicit actions handle approval, rejection, and recording payout completion with transaction details.
- Detail opens a dedicated payout-details dialog with copyable request/destination information.
- Approval/rejection/payment actions are separate from merely viewing the details.
- There is no order-directory-style shared status bulk toolbar.

### Program Settings

- Separate referral/program settings from payout rules.
- Edit program activation, commission settings, referral duration, eligibility, provider participation, and payout limits.
- Global provider connection configuration remains on Providers & API Integrations.
- The valuation review queue is a separate review table with pagination and selection.
- Select All in that queue selects the current page.
- Review actions open approve/reject dialogs; help opens a dedicated explanation dialog.

### Support Bot

- Owner-only setup and behavior settings.
- Connection status and setup guidance are separate from editable bot behavior.
- Edit localized welcome messages, categories, and FAQs.
- FAQ editing/approval is local to the selected item.
- Category deletion and FAQ deletion use confirmation prompts.
- Save persists the settings draft.
- This settings page is not a support-ticket/customer-order bulk-selection screen.

### BestChange XML

- Owner-only configuration/export page.
- Enable/disable the feed and edit advertised direction entries.
- A direction chooses source/destination settlement options and export-specific mapping/limits/reserve settings.
- Add/remove directions in the local draft, then Save Changes.
- Up to 50 directions are supported in the editor.
- Fiat receiving reserves are managed through Payment Methods/currency attachments.
- Saved-configuration preview, exclusions/diagnostics, feed-link actions, and tag reference are separate from the unsaved draft.
- No row checkbox Select All is offered for these direction entries.
- This is an export advertisement workflow, not a second execution/pricing engine.

### Blog

- Article directory with search/status organization and explicit row actions.
- Edit opens the article editor page.
- Create/edit drafts, publication/scheduling, and preview are separate actions.
- Delete uses a confirmation prompt; its text does not promise a universal permanent-delete policy.
- Category/content editing belongs to the article workflow rather than a generic catalog drawer.
- Blog automation has source/settings management, preview results, and run controls.
- Removing a source and running automation immediately both ask for confirmation.
- Automation-generated content follows an editorial review workflow rather than being equivalent to already reviewed publication.

### Newsletter Subscribers

- View subscribers and their active/unsubscribed state.
- Refresh reloads the subscriber list.
- Removing a subscriber asks for confirmation.
- No shared Select All/bulk subscriber action is shown.
- The announcement composer collects a title, short description, and Read More link.
- Publish Update queues delivery for active subscribers; it is not the Site content snapshot-publish control.

## 17. Dialog and confirmation inventory

The following inventory summarizes the distinct current editor/overlay families and confirmation entry points. Conditional actions appear only for eligible records and authorized operators.

| Area | Editor / overlay / prompt | Main workflow |
| --- | --- | --- |
| Access | Authenticator setup/challenge | Complete required security before entering Admin |
| Shell | Mobile navigation drawer | Open section, return to exchange, or sign out |
| Shell | Account/profile and page-action menus | Open account actions or current-page actions |
| Overview | Monitoring configuration editor | Inspect/edit permitted monitoring configuration, then save |
| Orders | Detail drawer | View order; save permitted operational changes |
| Orders | Dirty-close confirmation | Discard unsaved drawer changes or remain editing |
| Orders | Clear payment-details confirmation | Explicitly clear selected order payment details |
| Orders | Directory archive confirmation | Review archive target(s), then archive |
| Orders | Directory restore confirmation | Review archived target(s), then restore |
| Orders | Permanent-delete confirmation | Confirm destructive deletion |
| Catalog | Fiat Currency editor | Add/edit currency and related attachment workflow |
| Catalog | Payment Method drawer | Add/edit method, fields, and relevant reserves |
| Catalog | Crypto Asset drawer | Add/edit asset; confirm asset deletion |
| Catalog | Crypto Network drawer | Add/edit exact asset-network; confirm deletion |
| Catalog | Catalog delete confirmations | Confirm single/selected-record deletion |
| Assets/networks | Bulk configuration editor | Choose applied settings, review, apply |
| Assets | Provider catalog synchronization dialog | Run catalog sync/import and inspect summary |
| Networks | Set Wallet Address drawer | Enter wallet/memo, preview, confirm, inspect result |
| Networks | Assign Deposit Provider drawer | Select eligible exact routes, review, confirm |
| Networks | Provider-switch acknowledgement | Confirm Manual-to-provider change and separate deposit activation |
| Payment Methods | Bulk Fields dialog | Compose fields, review affected methods, acknowledge, apply |
| Payment Methods | Delete Fields dialog | Choose saved fields, review removals, confirm, apply |
| Payment Methods | Reserve dialog | Set reserves across the full selected-method scope |
| Pricing | Rule editor | Create/edit rule or inspect a read-only legacy rule |
| Pricing | Add/Edit Range dialog | Save/cancel one range in the containing rule draft |
| Pricing | Multi-create confirmation prompt | Confirm number of new pricing rules |
| Pricing | Bulk Edit drawer | Choose applied settings, then Apply Changes |
| Pricing | Single/bulk delete confirmation | Confirm rule deletion; bulk dialog identifies selected rules |
| Add-ons | In-page editor | Save/cancel add-on configuration |
| Add-ons | Delete confirmation prompt | Confirm deletion while retaining historical saved fees |
| Providers | Restricted Quickex configuration dialog | Complete unlock step and submit configuration |
| Providers | WhiteBIT configuration dialog | Submit restricted connection configuration |
| Providers | Address-permission confirmation | Acknowledge and verify one exact asset/network |
| Customers | Edit Customer dialog | Save personal/account-role and applicable referral settings |
| Customers | Reset Password dialog | Submit password and confirmation |
| Customers | Suspension confirmation | Confirm account suspension |
| Customers | Revoke-sessions confirmation | Confirm session revocation |
| Staff | Invite Team Member dialog | Submit member invitation |
| Staff | Edit Member Permissions dialog | Save role and explicit overrides |
| Staff | Assign Role dialog | Apply role to selected eligible members |
| Staff | Create/Edit Role dialog | Save reusable permission configuration |
| Staff | Single/bulk member removal prompt | Confirm removal |
| Staff | Single/bulk role deletion prompt | Confirm deletion; in-use roles are blocked |
| Affiliates | Payout details dialog | Read/copy request and destination details |
| Affiliates | Payout decision/payment flow | Approve, reject, or record payment as applicable |
| Program Settings | Valuation approve/reject dialog | Review and submit decision |
| Program Settings | Valuation help dialog | Read review instructions |
| Site content | Unsaved-page discard prompt | Keep current page edits or discard before changing page |
| Support Bot | Category/FAQ deletion prompts | Confirm removal from settings draft |
| Blog | Article deletion prompt | Confirm article removal |
| Blog automation | Remove-source prompt | Confirm source removal |
| Blog automation | Run-now prompt | Confirm immediate automation run |
| Newsletter | Subscriber removal prompt | Confirm removal from delivery audience |

### Actions that do not acquire a universal extra confirmation

- Ordinary editor Save/Create/Apply actions.
- Order-drawer archive/restore.
- Currency/payment-method Detach.
- Removing a range from a pricing draft.
- Removing a BestChange direction from its draft.
- Draft settings adjustments and preview switching.
- Opening details, copying information, filtering, and refreshing.

Do not add confirmation behavior to an implementation based on analogy with another screen. The current entry point determines whether a confirmation is present.

## 18. Selection scope reference

| Screen / workflow | Select All scope | Cross-page selection / action distinction |
| --- | --- | --- |
| Overview | None | Reporting and navigation only |
| Orders | Displayed page | Bulk actions use selected rows in the current view |
| Fiat Currencies | Displayed page | Selection clears on filter/page changes |
| Crypto Assets | Displayed page | Selection clears on filter/page changes |
| Crypto Networks | Displayed page | Selection clears on filter/page changes |
| Payment Methods: page checkbox | Displayed page | Selection persists across pages |
| Payment Methods: Select all filtered | Full filtered set | Adds filtered methods to persistent selection |
| Payment Methods: Enable/Disable/Delete | Selected current-page rows | Does not use every persisted selected ID |
| Payment Methods: Fields/Delete Fields | Full persistent selection | Up to 100 methods |
| Payment Methods: Reserve | Full persistent selection | Up to 1,000 methods |
| Manual Pricing | Filtered rules across pages | Bulk actions use the filtered selected-rule set |
| Staff Members | Eligible displayed-page members | Clears on page/page-size change; protected members excluded |
| Staff Roles | Displayed page | Clears on page/page-size change; in-use delete blocked |
| Customers | None | Searchable directory; profile/referral views are separate |
| Affiliates directory | Displayed page | Account selection is distinct from immutable ledger viewing |
| Valuation review queue | Displayed page | Review actions use the queue's selection |
| Provider assignment | Explicit exact-route set | Review scope is local to that drawer |
| Providers connection page | None | Provider controls are not a generic selected-row batch |
| Appearance / Background / Notifications | None | Draft and settings actions |
| Site content | No universal Select All | Per-page/per-entry draft workflows |
| BestChange directions | None | Draft entries, saved-config preview |
| Staff Activity / Revenue | None | Read-only reporting |
| Newsletter | None | Individual removal; announcement composer |

**Reusable rule:** Never implement a universal meaning for “Select All.” Keep page-selection, filtered-selection, and persistent-selection workflows distinct.

## 19. Mobile behavior

### Navigation

- The desktop sidebar is replaced by a hamburger-triggered navigation drawer at narrow widths.
- Mobile navigation uses the same permission-filtered destination order.
- It flattens the grouped desktop links into one destination list rather than exposing a different set of Admin sections.
- Selecting a destination closes the drawer.
- Back to Exchange and Sign Out are available in that drawer.
- Close control, backdrop dismissal, and keyboard handling belong to the drawer workflow.
- Opening navigation closes the account/profile and page-action menus; opening those menus closes navigation.

### Header actions

- Page actions can move into an overflow menu rather than disappearing.
- Account/profile actions remain separately accessible.
- The notification shortcut still navigates to Overview.
- Mobile controls do not bypass permission or confirmation checks.

### Tables and filters

- Dense tables remain tables and support horizontal swipe/scroll.
- The full table scrolls together; there are no universally frozen mobile columns.
- The Users directory additionally has a dedicated mobile card list; each card opens the customer profile.
- Search, filters, page-size controls, pagination, and selection remain part of each page's workflow.
- Compact toolbar arrangements do not change Select All scope.
- Payment Methods' persistent selection/current-page generic-action distinction remains the same on mobile.

### Editors and overlays

- Drawers use the available narrow-screen space and allow their content to scroll.
- Modal/editor content must remain reachable independently of the underlying page.
- Selector overlays can use compact/mobile presentations; a smaller selector does not change the selected identity or review target.
- Nested editors, such as a pricing range dialog, remain separate from saving their containing record.
- Explicit save, review, confirmation, error, and cancel controls retain their functional meaning across device sizes.

---

## Reuse checklist

When reusing this Admin structure:

- Preserve the current navigation hierarchy; do not invent standalone Routes, Crypto Assets, or Audit sidebar pages.
- Preserve permission filtering and Owner-only boundaries.
- Keep Swap and Convert operational workflows distinct.
- Keep catalog-enabled state separate from customer-deposit activation.
- Preserve exact asset-network identity during wallet/provider configuration.
- Keep field, reserve, pricing, and provider bulk operations in their own workflows.
- Preserve each list's actual selection scope, especially Payment Methods and Manual Pricing.
- Keep draft save, reviewed apply, and public publication distinct.
- Keep financial/audit views read-only where they are currently read-only.
- Preserve the entry-point-specific confirmation behavior instead of assuming every action shares one pattern.
- Reuse the organization and interactions without importing visual design, branding, credentials, live records, or backend implementation.
