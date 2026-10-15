/** Provider-neutral sequencing. All financial/readiness authority stays in the
 * existing provider actions supplied by the caller. */
export type SwitchStep = "disabling" | "assigning" | "verifying" | "restoring" | "checking";
export interface SwitchWorkflowActions {
  progress(step: SwitchStep): Promise<void>;
  disable(): Promise<void>;
  assign(): Promise<void>;
  verify(): Promise<void>;
  restore(): Promise<void>;
  check(): Promise<void>;
}

export async function executeDepositProviderSwitch(
  originalEnabled: boolean,
  provider: string,
  actions: SwitchWorkflowActions,
) {
  await actions.progress("disabling");
  await actions.disable();
  await actions.progress("assigning");
  await actions.assign();
  if (provider !== "none") {
    await actions.progress("verifying");
    await actions.verify();
    if (originalEnabled) {
      await actions.progress("restoring");
      await actions.restore();
    }
  }
  await actions.progress("checking");
  await actions.check();
}
