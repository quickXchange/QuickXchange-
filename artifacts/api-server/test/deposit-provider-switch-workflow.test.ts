import assert from "node:assert/strict";
import test from "node:test";
import { executeDepositProviderSwitch, type SwitchStep } from "../src/lib/deposit-provider-switch-workflow";

for (const provider of ["whitebit", "manual"]) {
  for (const originallyEnabled of [false, true]) {
    test(`${provider} verifies and restores only originally ${originallyEnabled ? "ON" : "OFF"} routes`, async () => {
      const events: string[] = [];
      let enabled = originallyEnabled;
      await executeDepositProviderSwitch(originallyEnabled, provider, {
        progress: async step => { events.push(step); },
        disable: async () => { enabled = false; },
        assign: async () => { assert.equal(enabled, false); },
        verify: async () => { assert.equal(enabled, false); },
        restore: async () => { enabled = true; },
        check: async () => { assert.equal(enabled, originallyEnabled); },
      });
      assert.deepEqual(events, ["disabling", "assigning", "verifying", ...(originallyEnabled ? ["restoring"] : []), "checking"]);
    });
  }
}
test("None removes the provider without attempting verification or enabling deposits", async () => {
  let enabled = true;
  await executeDepositProviderSwitch(true, "none", {
    progress: async () => {}, disable: async () => { enabled = false; }, assign: async () => {},
    verify: async () => { assert.fail("no provider to verify"); },
    restore: async () => { assert.fail("must remain OFF"); },
    check: async () => { assert.equal(enabled, false); },
  });
});
for (const failureStep of ["assigning", "verifying"] as SwitchStep[]) {
  test(`${failureStep} failure never restores deposits`, async () => {
    let enabled = true;
    let checked = false;
    const fail = async () => { throw new Error("Permission denied"); };
    await assert.rejects(executeDepositProviderSwitch(true, "whitebit", {
      progress: async () => {}, disable: async () => { enabled = false; },
      assign: failureStep === "assigning" ? fail : async () => {},
      verify: failureStep === "verifying" ? fail : async () => {},
      restore: async () => { assert.fail("must not enable"); },
      check: async () => { checked = true; },
    }), /Permission denied/);
    assert.equal(enabled, false);
    assert.equal(checked, false);
  });
}
