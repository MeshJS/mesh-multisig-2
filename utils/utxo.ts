import { UTxO } from "@meshsdk/core";
import { toTxUnspentOutput } from "@meshsdk/core-cst";
import { Serialization } from "@cardano-sdk/core";

export const utxosToCborMap = (utxos: UTxO[]): string => {
  const cborWriter = new Serialization.CborWriter();
  cborWriter.writeStartMap(utxos.length);
  for (const utxo of utxos) {
    const cardanoUtxo = toTxUnspentOutput(utxo);
    cborWriter.writeEncodedValue(
      Buffer.from(cardanoUtxo.input().toCbor(), "hex"),
    );
    cborWriter.writeEncodedValue(
      Buffer.from(cardanoUtxo.output().toCbor(), "hex"),
    );
  }
  return cborWriter.encodeAsHex();
};
