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
  CrowdfundTestUtils,
  drepRegisterDeposit,
  mockPoolId,
  stakeRegisterDeposit,
  totalDeposit,
} from "./test-utils";
import assert from "assert";

describe("Crowdfund Contribute", async () => {
  const initialTxHash =
    "886cd5fcb80ed1fd01d3c4eb409035295fc54ee9c37e71f100af9e1282b035af";
  const initialTxIndex = 1;
  const testUtils = new CrowdfundTestUtils(initialTxHash, initialTxIndex);
  const authTokenPolicyIdValue = testUtils.authTokenPolicyId();
  const authTokenScriptValue = testUtils.authTokenScript();
  const crowdfundScriptValue = testUtils.crowdfundScript();
  const crowdfundStakeScriptValue = testUtils.crowdfundStakeScript();
  const shareTokenScriptValue = testUtils.shareTokenScript();
  const stakeHashValue = testUtils.stakeHash();
  const rewardAddressValue = testUtils.rewardAddress();
  const drepIdValue = testUtils.drepId();

  const utxos: UTxO[] = [
    {
      input: {
        txHash: initialTxHash,
        outputIndex: initialTxIndex,
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
      .txIn(initialTxHash, initialTxIndex)
      .mintPlutusScriptV3()
      .mint("1", authTokenPolicyIdValue, "")
      .mintRedeemerValue(conStr0([]), "JSON")
      .mintingScript(authTokenScriptValue.cbor)
      .txOut(crowdfundScriptValue.address, [
        { unit: "lovelace", quantity: "2000000" },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr0([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            conStr0([
              conStr1([{ bytes: crowdfundScriptValue.hash }]),
              conStr1([]),
            ]),
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
        .txInScript(crowdfundScriptValue.cbor)
        .txOut(crowdfundScriptValue.address, [
          {
            unit: "lovelace",
            quantity: (2000000 + contributeAmount).toString(),
          },
          {
            unit: authTokenPolicyIdValue,
            quantity: "1",
          },
        ])
        .txOutInlineDatumValue(
          crowdfundScriptValue.datum(
            conStr0([
              conStr1([{ bytes: stakeHashValue }]),
              { bytes: shareTokenScriptValue.hash },
              conStr0([
                conStr1([{ bytes: crowdfundScriptValue.hash }]),
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
        .mint(contributeAmount.toString(), shareTokenScriptValue.hash, "")
        .mintingScript(shareTokenScriptValue.cbor)
        .mintRedeemerValue(conStr0([]), "JSON")
        .txOut(address, [
          {
            unit: "lovelace",
            quantity: "2000000",
          },
          {
            unit: `${shareTokenScriptValue.hash}`,
            quantity: contributeAmount.toString(),
          },
        ])
        .invalidHereafter(Number(resolveSlotNo("preprod")))
        .changeAddress(address)
        .complete();

      const signedTx = await wallet.signTxReturnFullTx(txHex);
      const evaluator = new OfflineEvaluator(fetcher, "preprod");
      console.log(
        "Evaluating transaction...",
        await evaluator.evaluateTx(signedTx, [], []),
      );
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
          .txInScript(crowdfundScriptValue.cbor)
          .txOut(crowdfundScriptValue.address, [
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
              unit: authTokenPolicyIdValue,
              quantity: "1",
            },
          ])
          .txOutInlineDatumValue(
            crowdfundScriptValue.datum(
              conStr0([
                conStr1([{ bytes: stakeHashValue }]),
                { bytes: shareTokenScriptValue.hash },
                conStr0([
                  conStr1([{ bytes: crowdfundScriptValue.hash }]),
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
          .registerStakeCertificate(rewardAddressValue)
          .drepRegistrationCertificate(drepIdValue)
          .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
          .certificateRedeemerValue(conStr0([]), "JSON")
          .voteDelegationCertificate(
            {
              dRepId: drepIdValue,
            },
            rewardAddressValue,
          )
          .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
          .certificateRedeemerValue(conStr0([]), "JSON")
          .delegateStakeCertificate(rewardAddressValue, mockPoolId)
          .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
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
