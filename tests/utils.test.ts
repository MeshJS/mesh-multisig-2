import { treasuryWithdrawalDatum } from "@/utils/proposal";
import assert from "assert";
import { describe, it } from "node:test";

describe("Utils", async () => {
  it("should produce the correct hash for proposal datum", async () => {
    const datumHash = treasuryWithdrawalDatum(
      [
        [
          "stake_test1uqfram3t06maztxee0w329zk6svhjgzzy0uch9t4d23e2fcxnpkjw",
          BigInt(1000000),
        ],
      ],
      "b73c484b015973259b2e4a20ce247bf8df9aae916991c44c1bf9fb2e",
    ).hash();

    assert(
      datumHash ===
        "ec28ce81d7b801b820f3ecb5eb8dd358b2bae58601aa61b5bc61eda64c33960d",
    );
  });
});
