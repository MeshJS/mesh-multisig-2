import {
  GcfAuthMintMintBlueprint,
  GcfStakePublishBlueprint,
  GcfSpendSpendBlueprint,
  ShareTokenMintBlueprint,
} from "@/types/gcf-spend";
import { conStr0, resolveScriptHash } from "@meshsdk/core";
import { RewardAccount, CredentialType, DRepID } from "@meshsdk/core-cst";
import {
  stakeRegisterDeposit,
  drepRegisterDeposit,
  govDeposit,
} from "./constants";

export class CrowdFundScript {
  constructor(
    private readonly txHash: string,
    private readonly txIndex: number,
    private readonly poolIdHash: string,
    private readonly proposerKeyHash: string,
    private readonly proposalHash: string,
  ) {}

  authTokenScript() {
    return new GcfAuthMintMintBlueprint([
      conStr0([
        {
          bytes: this.txHash,
        },
        { int: this.txIndex },
      ]),
    ]);
  }

  authTokenPolicyId() {
    return resolveScriptHash(this.authTokenScript().cbor, "V3");
  }

  crowdfundStakeScript() {
    return new GcfStakePublishBlueprint([
      {
        bytes: this.authTokenPolicyId(),
      },
    ]);
  }

  crowdfundScript() {
    return new GcfSpendSpendBlueprint(
      [
        { bytes: this.authTokenPolicyId() },
        { bytes: this.proposerKeyHash },
        { bytes: this.proposalHash },
        { bytes: this.poolIdHash },
        { int: stakeRegisterDeposit },
        { int: drepRegisterDeposit },
        { int: govDeposit },
      ],
      this.crowdfundStakeScript().hash,
      true,
    );
  }

  shareTokenScript() {
    return new ShareTokenMintBlueprint([{ bytes: this.authTokenPolicyId() }]);
  }

  stakeHash() {
    return this.crowdfundStakeScript().hash;
  }

  rewardAddress() {
    return RewardAccount.fromCredential(
      {
        hash: this.stakeHash(),
        type: CredentialType.ScriptHash,
      },
      0,
    );
  }

  drepId() {
    return DRepID.cip129FromCredential({
      hash: this.stakeHash(),
      type: CredentialType.ScriptHash,
    });
  }
}
