import { describe, it } from "node:test";
import { Emulator, SlotConfig } from "scalus";
import {
  conStr0,
  conStr1,
  MeshTxBuilder,
  OfflineFetcher,
  UTxO,
  resolveSlotNo,
  conStr,
} from "@meshsdk/core";
import { cborMapToUtxos, utxosToCborMap } from "@/utils/utxo";
import { AddressType, MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import {
  address,
  authTokenPolicyId,
  authTokenScript,
  crowdfundScript,
  crowdfundStakeScript,
  drepId,
  drepRegisterDeposit,
  mockPoolId,
  rewardAddress,
  shareTokenScript,
  stakeHash,
  stakeRegisterDeposit,
  totalDeposit,
} from "./test-utils";
import assert from "assert";

describe("Crowdfund Contribute", async () => {
  const utxos: UTxO[] = [
    {
      input: {
        txHash:
          "886cd5fcb80ed1fd01d3c4eb409035295fc54ee9c37e71f100af9e1282b035af",
        outputIndex: 1,
      },
      output: {
        address: address,
        amount: [
          {
            unit: "lovelace",
            quantity: "1000000000000",
          },
        ],
      },
    },
  ];

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
    mnemonic: [
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
    ],
  });

  it("should contribute to a crowdfund", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher,
    });
    const deadline = Date.now() + 1000000000;
    // Mint the auth token to the contributor's address
    const txHex = await txBuilder
      .txIn(
        "886cd5fcb80ed1fd01d3c4eb409035295fc54ee9c37e71f100af9e1282b035af",
        1,
      )
      .mintPlutusScriptV3()
      .mint("1", authTokenPolicyId, "")
      .mintRedeemerValue(conStr0([]), "JSON")
      .mintingScript(authTokenScript.cbor)
      .txOut(crowdfundScript.address, [
        { unit: "lovelace", quantity: "2000000" },
        {
          unit: authTokenPolicyId,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScript.datum(
          conStr0([
            { bytes: stakeHash },
            { bytes: shareTokenScript.hash },
            conStr0([conStr1([{ bytes: crowdfundScript.hash }]), conStr1([])]),
            { int: totalDeposit },
            { int: 0 },
            conStr0([]),
            { int: deadline },
            { int: 0 },
            { int: 0 },
          ]),
        ),
        "JSON",
      )
      .txInCollateral(utxos[0].input.txHash, utxos[0].input.outputIndex)
      .changeAddress(address)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);

    let submitResult = emulator.submitTx(Buffer.from(signedTx, "hex"));
    console.log("First transaction submit result:", submitResult);
    assert(submitResult.isSuccess);
    if (submitResult.isSuccess) {
      const allUtxos = emulator.getAllUtxos();
      const utxoList = allUtxos.map((u) => Buffer.from(u).toString("hex"));
      fetcher.addUTxOs(cborMapToUtxos(utxoList));

      const txBuilder = new MeshTxBuilder({
        fetcher,
      });

      // Contributing to crowdfund
      const contributeAmount = totalDeposit;
      const txHex = await txBuilder
        .txIn(submitResult.txHash!, 1)
        .txInCollateral(submitResult.txHash!, 1)
        .spendingPlutusScriptV3()
        .txIn(submitResult.txHash!, 0)
        .txInRedeemerValue(conStr0([]), "JSON")
        .txInInlineDatumPresent()
        .txInScript(crowdfundScript.cbor)
        .txOut(crowdfundScript.address, [
          {
            unit: "lovelace",
            quantity: (2000000 + contributeAmount).toString(),
          },
          {
            unit: authTokenPolicyId,
            quantity: "1",
          },
        ])
        .txOutInlineDatumValue(
          crowdfundScript.datum(
            conStr0([
              { bytes: stakeHash },
              { bytes: shareTokenScript.hash },
              conStr0([
                conStr1([{ bytes: crowdfundScript.hash }]),
                conStr1([]),
              ]),
              { int: totalDeposit },
              { int: contributeAmount },
              conStr0([]),
              { int: deadline },
              { int: 0 },
              { int: 0 },
            ]),
          ),
          "JSON",
        )
        .mintPlutusScriptV3()
        .mint(contributeAmount.toString(), shareTokenScript.hash, "")
        .mintingScript(shareTokenScript.cbor)
        .mintRedeemerValue(conStr0([]), "JSON")
        .txOut(address, [
          {
            unit: "lovelace",
            quantity: "2000000",
          },
          {
            unit: `${shareTokenScript.hash}`,
            quantity: contributeAmount.toString(),
          },
        ])
        .invalidHereafter(Number(resolveSlotNo("preprod")))
        .changeAddress(address)
        .complete();

      const signedTx = await wallet.signTxReturnFullTx(txHex);

      submitResult = emulator.submitTx(Buffer.from(signedTx, "hex"));
      console.log("Second transaction submit result:", submitResult);
      assert(submitResult.isSuccess);
      if (submitResult.isSuccess) {
        const allUtxos = emulator.getAllUtxos();
        const utxoList = allUtxos.map((u) => Buffer.from(u).toString("hex"));
        fetcher.addUTxOs(cborMapToUtxos(utxoList));
        const evaluator = new OfflineEvaluator(fetcher, "preprod");

        const txBuilder = new MeshTxBuilder({
          fetcher,
          evaluator,
        });

        // Register DRep, Stake, Delegate and vote
        const txHex = await txBuilder
          .txIn(submitResult.txHash!, 2)
          .txInCollateral(submitResult.txHash!, 2)
          .spendingPlutusScriptV3()
          .txIn(submitResult.txHash!, 0)
          .txInRedeemerValue(conStr(2, []), "JSON")
          .txInInlineDatumPresent()
          .txInScript(crowdfundScript.cbor)
          .txOut(crowdfundScript.address, [
            {
              unit: "lovelace",
              quantity: (
                2000000 +
                contributeAmount -
                stakeRegisterDeposit -
                drepRegisterDeposit
              ).toString(),
            },
            {
              unit: authTokenPolicyId,
              quantity: "1",
            },
          ])
          .txOutInlineDatumValue(
            crowdfundScript.datum(
              conStr0([
                { bytes: stakeHash },
                { bytes: shareTokenScript.hash },
                conStr0([
                  conStr1([{ bytes: crowdfundScript.hash }]),
                  conStr1([]),
                ]),
                { int: totalDeposit },
                { int: contributeAmount },
                conStr0([]),
                { int: deadline },
                { int: 0 },
                { int: 0 },
              ]),
            ),
            "JSON",
          )
          .registerStakeCertificate(rewardAddress)
          .drepRegistrationCertificate(drepId)
          .certificateScript(crowdfundStakeScript.cbor, "V3")
          .certificateRedeemerValue(conStr0([]), "JSON")
          .voteDelegationCertificate(
            {
              dRepId: drepId,
            },
            rewardAddress,
          )
          .certificateScript(crowdfundStakeScript.cbor, "V3")
          .certificateRedeemerValue(conStr0([]), "JSON")
          .delegateStakeCertificate(rewardAddress, mockPoolId)
          .certificateScript(crowdfundStakeScript.cbor, "V3")
          .certificateRedeemerValue(conStr0([]), "JSON")
          .changeAddress(address)
          .complete();

        const signedTx = await wallet.signTxReturnFullTx(txHex);

        const finalSubmitResult = emulator.submitTx(
          Buffer.from(signedTx, "hex"),
        );
        console.log("Final transaction submit result:", finalSubmitResult);
        assert(finalSubmitResult.isSuccess);
      }
    } else {
      console.log("Transaction failed to submit:", submitResult.error);
    }
  });
});
