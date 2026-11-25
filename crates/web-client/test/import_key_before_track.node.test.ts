// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, loadNodeSdk } from "./test-setup";

/**
 * Regression for #650: a failed keystore write during importAccountFile must
 * leave no tracked account so a retry after keystore recovery can succeed.
 */
test.describe("import key before track", () => {
  test("import_key_failure_leaves_no_tracked_account_and_retry_succeeds", async () => {
    test.slow();
    const sdk = loadNodeSdk();

    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "miden-import-src-"));
    fs.mkdirSync(path.join(srcDir, "keystore"), { recursive: true });
    const source = new sdk.WebClient();
    await source.createMockClient(
      path.join(srcDir, "store.db"),
      path.join(srcDir, "keystore"),
      null,
      null,
      null
    );
    const wallet = await source.newWallet(
      sdk.AccountStorageMode.private(),
      sdk.AuthScheme.AuthRpoFalcon512
    );
    const accountFile = await source.exportAccountFile(wallet.id());
    const accountIdHex = wallet.id().toString();

    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "miden-import-dst-"));
    const keystorePath = path.join(destDir, "keystore");
    fs.mkdirSync(keystorePath, { recursive: true });
    const dest = new sdk.WebClient();
    await dest.createMockClient(
      path.join(destDir, "store.db"),
      keystorePath,
      null,
      null,
      null
    );

    // Break the filesystem keystore after client creation: replace the
    // directory with a regular file so the next add_key fails on write.
    fs.rmSync(keystorePath, { recursive: true, force: true });
    fs.writeFileSync(keystorePath, "not-a-directory");

    await expect(dest.importAccountFile(accountFile)).rejects.toThrow();

    const trackedAfterFail = await dest.getAccounts();
    expect(trackedAfterFail.map((a) => a.id().toString())).not.toContain(
      accountIdHex
    );

    // Restore keystore and retry on a fresh client over the same store.
    fs.rmSync(keystorePath, { force: true });
    fs.mkdirSync(keystorePath, { recursive: true });

    const dest2 = new sdk.WebClient();
    await dest2.createMockClient(
      path.join(destDir, "store.db"),
      keystorePath,
      null,
      null,
      null
    );
    await dest2.importAccountFile(accountFile);
    const trackedAfterRetry = await dest2.getAccounts();
    expect(trackedAfterRetry.map((a) => a.id().toString())).toContain(
      accountIdHex
    );
  });
});
