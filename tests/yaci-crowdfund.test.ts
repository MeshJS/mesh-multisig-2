import { afterEach, describe, it } from "node:test";
import {
  conStr0,
  conStr1,
  MeshTxBuilder,
  resolveSlotNo,
  YaciProvider,
} from "@meshsdk/core";
import { AddressType, MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { CrowdfundTestUtils, totalDeposit } from "./test-utils";
import { OfflineEvaluator } from "@meshsdk/core-csl";

describe("Yaci Crowdfund Contribute", async () => {
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

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

  const walletAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();

  const initialTxHash =
    "a9aa2fcfed0ccf5363eca9c855769e5ffbf7e9d11d2569fd6905fa3f54b4af32";
  const initialTxIndex = 0;
  const testUtils = new CrowdfundTestUtils(initialTxHash, initialTxIndex);
  const authTokenPolicyIdValue = testUtils.authTokenPolicyId();
  const authTokenScriptValue = testUtils.authTokenScript();
  const crowdfundScriptValue = testUtils.crowdfundScript();
  const shareTokenScriptValue = testUtils.shareTokenScript();
  const stakeHashValue = testUtils.stakeHash();
  const deadline = 1783046375000;
  let lastSubmitted: string =
    "87349fd1c6ded74cf999cec5eecfa38bbf6265e05f7577d135d5646d702d77f2";

  it("should mint authority tokens to script", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
    });
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
    lastSubmitted = txHash;
  });

  it("should contribute to a crowdfund", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
    });
    // Contributing to crowdfund
    const contributeAmount = totalDeposit;
    const latestBlock = await provider.get("/blocks/latest");
    const txHex = await txBuilder
      .txIn(lastSubmitted, 1)
      .txInCollateral(lastSubmitted, 1)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
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
            { bytes: stakeHashValue },
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
      .txOut(walletAddress, [
        {
          unit: "lovelace",
          quantity: "2000000",
        },
        {
          unit: `${shareTokenScriptValue.hash}`,
          quantity: contributeAmount.toString(),
        },
      ])
      .invalidHereafter(latestBlock.slot + 30)
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    let txHash;
    try {
      txHash = await provider.submitTx(signedTx);
    } catch (e) {
      console.error("Failed to submit transaction:", e);
      throw e;
    }
    lastSubmitted = txHash;
  });
});
