import { utxosToCborMap } from "@/utils/utxo";
import {
  conStr0,
  conStr1,
  conStr3,
  hashDrepAnchor,
  MeshTxBuilder,
  OfflineFetcher,
  UTxO,
  serializeData,
} from "@meshsdk/core";
import { describe, it } from "node:test";
import { Emulator, SlotConfig } from "scalus";
import {
  address,
  authTokenPolicyId,
  crowdfundScriptCustomProposal,
  rewardAddress,
  shareTokenScript,
  stakeHash,
  totalDeposit,
} from "./test-utils";
import { MeshCardanoHeadlessWallet, AddressType } from "@meshsdk/wallet";
import assert from "assert";
import { RewardAccount } from "@meshsdk/core-cst";

describe("Crowdfund Propose", async () => {
  const deadline = Date.now() + 1000000000;

  const utxosCustomProposal = (proposalCbor: string): UTxO[] => {
    const crowdfundScript = crowdfundScriptCustomProposal(proposalCbor);
    return [
      {
        input: {
          outputIndex: 1,
          txHash:
            "6255a7c184fa29431cd19e05ae0feda663e57b47ca1edf749b8def00202ef0f7",
        },
        output: {
          address: address,
          amount: [
            { unit: "lovelace", quantity: "2000000" },
            {
              unit: "989cfc78fa5215f0a7f3bed669c12e7de088f3044aa6e50581039453",
              quantity: "100502000000",
            },
          ],
        },
      },
      {
        input: {
          outputIndex: 0,
          txHash:
            "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        },
        output: {
          address: crowdfundScript.address,
          amount: [
            { unit: "lovelace", quantity: "100002000000" },
            {
              unit: "bdfc050e3950b2d245b1dc52646d4fbc3264999d5e98fac693e59255",
              quantity: "1",
            },
          ],
          dataHash:
            "ad9e77fabf6ac2789829be64f860d8b51d78e3292a50164df32419101039858d",
          plutusData: serializeData(
            crowdfundScript.datum(
              conStr0([
                { bytes: stakeHash },
                { bytes: shareTokenScript.hash },
                conStr0([
                  conStr1([{ bytes: crowdfundScript.hash }]),
                  conStr1([]),
                ]),
                { int: totalDeposit },
                { int: totalDeposit },
                conStr0([]),
                { int: deadline },
                { int: 0 },
                { int: 0 },
              ]),
            ),
            "JSON",
          ),
        },
      },
      {
        input: {
          outputIndex: 1,
          txHash:
            "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        },
        output: {
          address: address,
          amount: [{ unit: "lovelace", quantity: "899490241122" }],
        },
      },
    ];
  };

  const walletMnemonic = [
    "horror",
    "hand",
    "pulp",
    "market",
    "slight",
    "photo",
    "frown",
    "pulp",
    "crawl",
    "day",
    "senior",
    "property",
    "calm",
    "inner",
    "reflect",
    "stage",
    "spot",
    "before",
    "charge",
    "artist",
    "together",
    "heavy",
    "quote",
    "soup",
  ];

  it("should allow proposing a governance info action", async () => {
    const infoActionProposalCbor = "d87f80";
    const crowdfundScript = crowdfundScriptCustomProposal(
      infoActionProposalCbor,
    );
    const utxos = utxosCustomProposal(infoActionProposalCbor);

    const emulator = new Emulator(
      Buffer.from(utxosToCborMap(utxos), "hex"),
      SlotConfig.preprod,
    );

    const fetcher = new OfflineFetcher("preprod");
    fetcher.addUTxOs(utxos);

    const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
      networkId: 0,
      fetcher,
      walletAddressType: AddressType.Base,
      mnemonic: walletMnemonic,
    });

    const txBuilder = new MeshTxBuilder({
      fetcher,
    });

    const txHex = await txBuilder
      .txIn(
        "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        1,
      )
      .txInCollateral(
        "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        1,
      )
      .spendingPlutusScriptV3()
      .txIn(
        "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        0,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr3([]), "JSON")
      .txInScript(crowdfundScript.cbor)
      .txOut(crowdfundScript.address, [
        {
          unit: "lovelace",
          quantity: (2000000).toString(),
        },
        {
          unit: authTokenPolicyId,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScript.datum(
          conStr1([
            { bytes: stakeHash },
            { bytes: shareTokenScript.hash },
            { int: 100502000000 },
            { int: deadline },
          ]),
        ),
        "JSON",
      )
      .proposal(
        { action: {}, kind: "InfoAction" },
        { anchorDataHash: hashDrepAnchor({}), anchorUrl: "" },
        rewardAddress,
      )
      .changeAddress(address)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);

    const submitResult = emulator.submitTx(Buffer.from(signedTx, "hex"));
    console.log("Submit result:", submitResult);
    assert(submitResult.isSuccess, `Transaction failed: ${submitResult.error}`);
  });

  it("should allow proposing a governance treasury withdrawal action", async () => {
    const treasuryWithdrawalProposalCbor =
      "d87b9fa1d8799f581c438c6bf73d7145b3b343b866816801e59b5a2e0daf477e9040bb41b0ff1a000f4240d87a80ff";
    const crowdfundScript = crowdfundScriptCustomProposal(
      treasuryWithdrawalProposalCbor,
    );
    const utxos = utxosCustomProposal(treasuryWithdrawalProposalCbor);

    const emulator = new Emulator(
      Buffer.from(utxosToCborMap(utxos), "hex"),
      SlotConfig.preprod,
    );

    const fetcher = new OfflineFetcher("preprod");
    fetcher.addUTxOs(utxos);

    const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
      networkId: 0,
      fetcher,
      walletAddressType: AddressType.Base,
      mnemonic: walletMnemonic,
    });

    const txBuilder = new MeshTxBuilder({
      fetcher,
    });

    const txHex = await txBuilder
      .txIn(
        "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        1,
      )
      .txInCollateral(
        "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        1,
      )
      .spendingPlutusScriptV3()
      .txIn(
        "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
        0,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr3([]), "JSON")
      .txInScript(crowdfundScript.cbor)
      .txOut(crowdfundScript.address, [
        {
          unit: "lovelace",
          quantity: (2000000).toString(),
        },
        {
          unit: authTokenPolicyId,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScript.datum(
          conStr1([
            { bytes: stakeHash },
            { bytes: shareTokenScript.hash },
            { int: 100502000000 },
            { int: deadline },
          ]),
        ),
        "JSON",
      )
      .proposal(
        {
          action: {
            withdrawals: {
              [RewardAccount.fromCredential(
                {
                  hash: "438c6bf73d7145b3b343b866816801e59b5a2e0daf477e9040bb41b0",
                  type: 0,
                },
                0,
              )]: String(1000000),
            },
          },
          kind: "TreasuryWithdrawalsAction",
        },
        { anchorDataHash: hashDrepAnchor({}), anchorUrl: "" },
        rewardAddress,
      )
      .changeAddress(address)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);

    const submitResult = emulator.submitTx(Buffer.from(signedTx, "hex"));
    console.log("Submit result:", submitResult);
    assert(submitResult.isSuccess, `Transaction failed: ${submitResult.error}`);
  });
});
