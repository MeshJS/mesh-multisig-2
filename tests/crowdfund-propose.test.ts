import { cborMapToUtxos, utxosToCborMap } from "@/utils/utxo";
import {
  conStr0,
  conStr1,
  conStr3,
  hashDrepAnchor,
  MeshTxBuilder,
  OfflineFetcher,
  UTxO,
} from "@meshsdk/core";
// import { OfflineEvaluator } from "@meshsdk/core-csl";
import { describe, it } from "node:test";
import { Emulator, SlotConfig } from "scalus";
import {
  address,
  authTokenPolicyId,
  crowdfundScript,
  crowdfundStakeScript,
  rewardAddress,
  shareTokenScript,
  stakeHash,
} from "./test-utils";
import { MeshCardanoHeadlessWallet, AddressType } from "@meshsdk/wallet";

describe("Crowdfund Propose", async () => {
  const utxos: UTxO[] = [
    {
      input: {
        outputIndex: 1,
        txHash:
          "6255a7c184fa29431cd19e05ae0feda663e57b47ca1edf749b8def00202ef0f7",
      },
      output: {
        address:
          "addr_test1qr08qlxewpc7af2f7gwg04emu4w3334sfqp2r7xqeh4fuxcj8mhzkl4h6ykdnj7az529d4qe0ysyygle3w2h264rj5ns84xnl5",
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
        address:
          "addr_test1xz5s5f4j6jc3vvxakfjh4yg29vt8z4ek47x8qcyccnjeuve26f9kyfqf7vrujuu9x49ngex8kjanl74km4gd5exj5c8sgnwmra",
        amount: [
          { unit: "lovelace", quantity: "100002000000" },
          {
            unit: "bdfc050e3950b2d245b1dc52646d4fbc3264999d5e98fac693e59255",
            quantity: "1",
          },
        ],
        dataHash:
          "ad9e77fabf6ac2789829be64f860d8b51d78e3292a50164df32419101039858d",
        plutusData:
          "d8799f581c2ad24b622409f307c97385354b3464c7b4bb3ffab6dd50da64d2a60f581c989cfc78fa5215f0a7f3bed669c12e7de088f3044aa6e50581039453d8799fd87a9f581ca90a26b2d4b11630ddb2657a910a2b16715736af8c706098c4e59e33ffd87a80ff1b000000176662d1801b000000176662d180d879801b0000019cf3ee526d0000ff",
      },
    },
    {
      input: {
        outputIndex: 1,
        txHash:
          "644a0fcfeeb066c9c63b120ff0b9e07211b6109c5d43bb77cefcc6cd0983a3b0",
      },
      output: {
        address:
          "addr_test1qr08qlxewpc7af2f7gwg04emu4w3334sfqp2r7xqeh4fuxcj8mhzkl4h6ykdnj7az529d4qe0ysyygle3w2h264rj5ns84xnl5",
        amount: [{ unit: "lovelace", quantity: "899490241122" }],
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
  it("should allow proposing a governance action", async () => {
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
            { int: 1773619008109 },
          ]),
        ),
        "JSON",
      )
      .proposal(
        { action: {}, kind: "InfoAction" },
        { anchorDataHash: hashDrepAnchor({}), anchorUrl: "" },
        rewardAddress,
      )
      .setFee("3049621")
      .changeAddress(address)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);

    const submitResult = emulator.submitTx(Buffer.from(signedTx, "hex"));
    console.log("Submit result:", submitResult);
  });
});
