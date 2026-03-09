import { describe, it } from "node:test";
import { conStr0, conStr1, MeshTxBuilder, YaciProvider } from "@meshsdk/core";
import { AddressType, MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import {
  authTokenPolicyId,
  authTokenScript,
  crowdfundScript,
  shareTokenScript,
  stakeHash,
  totalDeposit,
} from "./test-utils";
import assert from "assert";

describe("Yaci Crowdfund Contribute", async () => {
  const initialTxHash =
    "886cd5fcb80ed1fd01d3c4eb409035295fc54ee9c37e71f100af9e1282b035af";
  const initialTxIndex = 1;
  const authTokenPolicyIdValue = authTokenPolicyId(
    initialTxHash,
    initialTxIndex,
  );
  const authTokenScriptValue = authTokenScript(initialTxHash, initialTxIndex);
  const crowdfundScriptValue = crowdfundScript(initialTxHash, initialTxIndex);
  const shareTokenScriptValue = shareTokenScript(initialTxHash, initialTxIndex);
  const stakeHashValue = stakeHash(initialTxHash, initialTxIndex);

  const provider = new YaciProvider("http://localhost:8080/api/v1");

  const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
    networkId: 0,
    fetcher: provider,
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
    const walletAddress = await wallet.getChangeAddressBech32();
    const utxos = await provider.fetchAddressUTxOs(walletAddress);
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
    });
    const deadline = Date.now() + 1000000000;
    // Mint the auth token to the script address
    const txHex = await txBuilder
      .selectUtxosFrom(utxos)
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
            { bytes: stakeHashValue },
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
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    const txHash = await provider.submitTx(signedTx);
    assert.ok(txHash);
  });
});
