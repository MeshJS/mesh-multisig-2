import {
  Address,
  fromBuilderToPlutusData,
  PlutusData,
} from "@meshsdk/core-cst";
import { conStr, PlutusData as MeshPlutusData } from "@meshsdk/core";

export const treasuryWithdrawalDatum = (
  beificiaryAmounts: [string, bigint][],
  guardrailScriptHash: string,
): PlutusData => {
  const meshBenficiaryList: { k: MeshPlutusData; v: MeshPlutusData }[] = [];
  for (const [beneficiary, amount] of beificiaryAmounts) {
    const rewardAddress = Address.fromBech32(beneficiary).asReward();
    if (!rewardAddress) {
      throw new Error(`Invalid reward address: ${beneficiary}`);
    }
    meshBenficiaryList.push({
      k: {
        constructor: rewardAddress.getPaymentCredential().type.valueOf(),
        fields: [
          {
            bytes: rewardAddress.getPaymentCredential().hash,
          },
        ],
      } as MeshPlutusData,
      v: { int: amount },
    });
  }

  return fromBuilderToPlutusData({
    content: {
      constructor: 2,
      fields: [
        {
          map: meshBenficiaryList,
        },
        {
          constructor: 0,
          fields: [
            {
              bytes: guardrailScriptHash,
            },
          ],
        },
      ],
    },
    type: "JSON",
  });
};

export const infoActionDatum = (): PlutusData => {
  return fromBuilderToPlutusData({
    type: "JSON",
    content: conStr(6, []),
  });
};
